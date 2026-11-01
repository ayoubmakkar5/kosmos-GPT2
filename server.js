'use strict';
/**
 * Kosmos AI — HTTP server.
 *
 * Zero dependencies. Serves the single-page app, the password gate, the
 * conversation/project API and an SSE streaming bridge to llama-server.
 */
const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const config = require('./config');
const engine = require('./engine-client');
const { Store } = require('./store');
const { Sessions, LoginGuard, passwordMatches, parseCookies, serializeCookie, cookiePolicy } = require('./auth');
const { buildSystemPrompt, fitHistory } = require('./prompts');
const { LFM3_CHAT_TEMPLATE } = require('./chat-template');

// --------------------------------------------------------------------- stores
const convStore = new Store('conversations', { items: [] });
const projectStore = new Store('projects', { items: [] });
const sessionStore = new Store('sessions', { items: {} });

let sessions, guard;

// --------------------------------------------------------------------- helpers
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

const id = () => crypto.randomBytes(9).toString('base64url');

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return (req.socket.remoteAddress || '').replace('::ffff:', '');
}

function sendJSON(res, status, payload, headers = {}) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
    ...headers
  });
  res.end(body);
}

function readBody(req, limit = config.limits.maxBodyBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      if (!raw.length) return resolve({});
      try {
        resolve(JSON.parse(raw.toString('utf8')));
      } catch {
        // tolerate another compression layer some proxies add
        try {
          resolve(JSON.parse(zlib.gunzipSync(raw).toString('utf8')));
        } catch {
          reject(Object.assign(new Error('invalid JSON body'), { status: 400 }));
        }
      }
    });
    req.on('error', reject);
  });
}

/** A conversation belongs to the session that created it. */
function ownsConversation(conv, session) {
  return Boolean(conv && session && conv.owner === session.token);
}

function publicConversation(conv, { withMessages = true } = {}) {
  return {
    id: conv.id,
    title: conv.title,
    mode: conv.mode,
    projectId: conv.projectId || null,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    messageCount: conv.messages.length,
    ...(withMessages ? { messages: conv.messages } : {})
  };
}

/** Remove chat-template artefacts a model may echo back into its answer. */
function cleanReply(text) {
  let out = String(text || '');
  // drop complete echoed template blocks, then any leftover markers
  out = out.replace(/<\|im_start\|>[\s\S]*?<\|im_end\|>/g, ' ');
  out = out.replace(/<\|(?:im_start|im_end|endoftext|eot_id|end_of_turn|start_of_turn)\|>/g, ' ');
  // a model that starts by replaying the prompt often prefixes "user: … assistant:"
  out = out.replace(/^\s*(?:user|human|assistant|system)\s*:\s*/i, '');
  out = out.replace(/[ \t]{2,}/g, ' ');
  // collapse the blank lines the removals leave behind
  out = out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

/**
 * The part of a streamed answer that is safe to show: everything up to a
 * possible in-flight template marker such as "<|im_en".
 */
function stablePrefix(raw) {
  const cleaned = cleanReply(raw);
  const open = cleaned.lastIndexOf('<');
  if (open === -1) return cleaned;
  const tail = cleaned.slice(open);
  // only a genuine marker prefix ("<|", "<|im", "<|im_en", …) is held back;
  // a plain "<" in prose ("a < b") must stream through immediately
  if (/^<\|?[A-Za-z_]*$/.test(tail) && tail.length < 16) return cleaned.slice(0, open);
  return cleaned;
}

function titleFrom(text) {
  const clean = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return 'New chat';
  return clean.length > 52 ? `${clean.slice(0, 52)}…` : clean;
}

// ------------------------------------------------------------------ SSE bridge
function sseInit(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no'
  });
  return (event, data) => {
    if (res.writableEnded || res.destroyed) return false;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch {
      return false;
    }
  };
}

// -------------------------------------------------------------- static files
const CACHE_IMMUTABLE = new Set(['.woff2', '.png', '.jpg', '.svg', '.webp']);

async function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  rel = decodeURIComponent(rel);
  const abs = path.join(config.publicDir, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!abs.startsWith(config.publicDir)) return sendJSON(res, 403, { error: 'forbidden' });

  let data;
  try {
    data = await fsp.readFile(abs);
  } catch {
    // SPA fallback: unknown non-asset paths render the app shell
    if (path.extname(rel)) return sendJSON(res, 404, { error: 'not_found' });
    try {
      data = await fsp.readFile(path.join(config.publicDir, 'index.html'));
    } catch {
      return sendJSON(res, 404, { error: 'index_missing' });
    }
  }

  const ext = path.extname(abs).toLowerCase();
  const etag = `"${crypto.createHash('sha1').update(data).digest('base64url').slice(0, 18)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { etag });
    return res.end();
  }
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'content-length': data.length,
    etag,
    'cache-control': CACHE_IMMUTABLE.has(ext) ? 'public, max-age=31536000, immutable' : 'no-cache'
  });
  res.end(req.method === 'HEAD' ? undefined : data);
}

// ------------------------------------------------------------------ API: auth
async function apiLogin(req, res) {
  const ip = clientIp(req);
  const left = guard.blocked(ip);
  if (left <= 0) {
    return sendJSON(res, 429, {
      error: 'too_many_attempts',
      message: 'Too many attempts. Try again in 10 minutes.',
      messageAr: 'محاولات كثيرة جداً. حاول بعد 10 دقائق.'
    });
  }
  let body;
  try {
    body = await readBody(req, 4096);
  } catch {
    return sendJSON(res, 400, { error: 'bad_request' });
  }
  if (!passwordMatches(body.password)) {
    guard.fail(ip);
    return sendJSON(res, 401, {
      error: 'invalid_password',
      message: 'Wrong password.',
      messageAr: 'كلمة السر غير صحيحة.',
      attemptsLeft: guard.blocked(ip)
    });
  }
  guard.reset(ip);
  const session = sessions.create({
    persistent: body.persistent !== false,
    ua: req.headers['user-agent'] || '',
    ip
  });
  const maxAge = Math.floor((session.expiresAt - Date.now()) / 1000);
  // The login XHR is same-origin, so fetch metadata alone cannot tell us the
  // page is framed inside someone else's site — the client reports that.
  // Without it the cookie ships as SameSite=Lax, the browser drops it as a
  // third-party cookie, and the next /me call 401s.
  const framed = body.framed === true || req.headers['x-kosmos-framed'] === '1';
  const policy = cookiePolicy(req, { framed });
  sendJSON(res, 200, {
    ok: true,
    expiresAt: session.expiresAt,
    cookie: policy
  }, {
    'set-cookie': serializeCookie(config.session.cookie, session.token, { maxAge, ...policy })
  });
}

function apiLogout(req, res, session) {
  if (session) sessions.destroy(session.token);
  sendJSON(res, 200, { ok: true }, {
    'set-cookie': serializeCookie(config.session.cookie, '', { maxAge: 0, ...cookiePolicy(req) })
  });
}

// ---------------------------------------------------------- API: conversations
function apiListConversations(res, session) {
  const items = convStore.data.items
    .filter((c) => ownsConversation(c, session))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((c) => publicConversation(c, { withMessages: false }));
  sendJSON(res, 200, { items });
}

function apiGetConversation(res, session, cid) {
  const conv = convStore.data.items.find((c) => c.id === cid);
  if (!ownsConversation(conv, session)) return sendJSON(res, 404, { error: 'not_found' });
  sendJSON(res, 200, publicConversation(conv));
}

async function apiCreateConversation(req, res, session) {
  let body = {};
  try {
    body = await readBody(req, 64 * 1024);
  } catch { /* defaults */ }
  const now = Date.now();
  const mine = convStore.data.items.filter((c) => ownsConversation(c, session));
  if (mine.length >= config.limits.maxConversations) {
    // rotate out the oldest empty conversation instead of refusing forever
    const empty = mine.filter((c) => c.messages.length === 0).sort((a, b) => a.updatedAt - b.updatedAt)[0];
    if (empty) convStore.data.items = convStore.data.items.filter((c) => c.id !== empty.id);
  }
  const conv = {
    id: id(),
    owner: session.token,
    title: body.title ? titleFrom(body.title) : 'New chat',
    mode: ['chat', 'code', 'explain', 'debug'].includes(body.mode) ? body.mode : 'chat',
    projectId: body.projectId || null,
    createdAt: now,
    updatedAt: now,
    messages: []
  };
  convStore.data.items.push(conv);
  await convStore.save();
  sendJSON(res, 201, publicConversation(conv));
}

async function apiUpdateConversation(req, res, session, cid) {
  const conv = convStore.data.items.find((c) => c.id === cid);
  if (!ownsConversation(conv, session)) return sendJSON(res, 404, { error: 'not_found' });
  let body = {};
  try { body = await readBody(req, 256 * 1024); } catch { return sendJSON(res, 400, { error: 'bad_request' }); }
  if (typeof body.title === 'string') conv.title = titleFrom(body.title);
  if (['chat', 'code', 'explain', 'debug'].includes(body.mode)) conv.mode = body.mode;
  if (body.projectId === null || typeof body.projectId === 'string') conv.projectId = body.projectId;
  conv.updatedAt = Date.now();
  await convStore.save();
  sendJSON(res, 200, publicConversation(conv, { withMessages: false }));
}

async function apiDeleteConversation(res, session, cid) {
  const before = convStore.data.items.length;
  convStore.data.items = convStore.data.items.filter((c) => !(c.id === cid && c.owner === session.token));
  if (convStore.data.items.length === before) return sendJSON(res, 404, { error: 'not_found' });
  await convStore.save();
  sendJSON(res, 200, { ok: true });
}

// ----------------------------------------------------------------- API: chat
function buildMessagesFor(conv, { priorMessages, userText, mode, lang, attachments, knowledge, instructions }) {
  let system = buildSystemPrompt({
    mode: mode || conv.mode || 'chat',
    lang,
    hasAttachments: Boolean((attachments && attachments.length) || (knowledge && knowledge.length))
  });
  if (instructions && String(instructions).trim()) {
    system += `\n\n<project_instructions>\n${String(instructions).slice(0, 8000)}\n</project_instructions>`;
  }

  const contextBlocks = [];
  if (knowledge && knowledge.length) {
    const budget = Math.floor(config.limits.maxTextExtract / Math.max(1, knowledge.length));
    for (const doc of knowledge.slice(0, 12)) {
      const text = String(doc.text || '').slice(0, budget);
      if (text.trim()) contextBlocks.push(`<document name="${doc.name}">\n${text}\n</document>`);
    }
  }
  if (attachments && attachments.length) {
    for (const f of attachments) {
      const text = String(f.text || '').slice(0, config.limits.maxTextExtract);
      if (text.trim()) contextBlocks.push(`<attached_file name="${f.name}">\n${text}\n</attached_file>`);
    }
  }

  const history = fitHistory(
    (priorMessages || [])
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: String(m.content || '') })),
    Math.max(2000, config.limits.maxPromptChars - String(userText || '').length)
  );

  const messages = [{ role: 'system', content: system + (contextBlocks.length ? `\n\n${contextBlocks.join('\n\n')}` : '') }];
  messages.push(...history);

  const images = [];
  if (attachments && attachments.length) {
    for (const f of attachments) {
      if (f.kind === 'image' && f.dataUrl) images.push(f.dataUrl);
    }
  }
  if (images.length) {
    messages.push({
      role: 'user',
      content: [{ type: 'text', text: userText || 'Describe this image.' }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))]
    });
  } else {
    messages.push({ role: 'user', content: userText });
  }
  return { messages, images: images.length };
}

async function apiChat(req, res, session) {
  const body = await readBody(req);
  const target = convStore.data.items.find((c) => c.id === body.conversationId);
  if (!ownsConversation(target, session)) return sendJSON(res, 404, { error: 'not_found' });

  const userText = String(body.message || '').slice(0, config.limits.maxPromptChars);
  if (!userText.trim() && !(body.attachments || []).length) {
    return sendJSON(res, 400, { error: 'empty_message' });
  }
  if (engine.state !== 'ready') {
    await engine.start();
    if (engine.state !== 'ready') {
      return sendJSON(res, 503, {
        error: 'model_unavailable',
        message: engine.error || 'The model is still loading.',
        messageAr: 'النموذج غير جاهز بعد.',
        engine: engine.info()
      });
    }
  }

  const project = target.projectId
    ? projectStore.data.items.find((p) => p.id === target.projectId && p.owner === session.token)
    : null;

  const { messages } = buildMessagesFor(target, {
    priorMessages: target.messages,
    userText,
    mode: body.mode || target.mode,
    lang: body.lang === 'en' ? 'en' : 'ar',
    attachments: body.attachments,
    knowledge: project ? project.docs : null,
    instructions: project ? project.instructions : null
  });

  const userMessage = {
    id: id(),
    role: 'user',
    content: userText,
    createdAt: Date.now(),
    attachments: (body.attachments || []).map((a) => ({ name: a.name, kind: a.kind, size: a.size })),
    mode: body.mode || target.mode
  };
  target.messages.push(userMessage);
  if (target.messages.length === 1) target.title = titleFrom(userText);
  target.updatedAt = Date.now();
  await convStore.save();

  const assistantId = id();
  const send = sseInit(res);
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  send('start', {
    conversationId: target.id,
    messageId: assistantId,
    userMessageId: userMessage.id,
    model: engine.info(),
    createdAt: Date.now()
  });

  const startedAt = Date.now();
  let content = '';
  let rawContent = '';
  let emitted = 0;
  let reasoning = '';
  let stats = null;
  let aborted = false;

  try {
    const stream = engine.chatStream(
      {
        model: config.model.name,
        messages,
        stream: true,
        temperature: Number(body.temperature ?? config.model.recommend.temperature),
        top_k: config.model.recommend.topK,
        repeat_penalty: config.model.recommend.repetitionPenalty,
        max_tokens: Number(body.maxTokens ?? 1024),
        // ask llama-server for the token counts so tok/s is real, not guessed
        stream_options: { include_usage: true },
        // Belt-and-braces: even a fine-tune that lost its template cannot
        // keep generating past its own chat markers.
        stop: config.model.stop,
        chat_template_kwargs: body.thinking ? { enable_thinking: true } : { enable_thinking: false }
      },
      controller.signal
    );

    for await (const frame of stream) {
      const choice = frame.choices && frame.choices[0];
      if (!choice) {
        if (frame.usage) stats = frame.usage;
        continue;
      }
      const delta = choice.delta || {};
      if (delta.reasoning_content) {
        reasoning += delta.reasoning_content;
        send('reasoning', { text: delta.reasoning_content });
      }
      if (delta.content) {
        rawContent += delta.content;
        // Hold back a tail that might be the beginning of a template marker
        // (e.g. "<|im_en" before "d|>" arrives), so the user never sees one.
        const stable = stablePrefix(rawContent);
        if (stable.length > emitted) {
          send('delta', { text: stable.slice(emitted) });
          emitted = stable.length;
        }
      }
      if (frame.usage) stats = frame.usage;
    }
  } catch (err) {
    aborted = controller.signal.aborted;
    if (!aborted) send('error', { message: err.message });
  }

  const elapsed = (Date.now() - startedAt) / 1000;
  const tokens = stats ? stats.completion_tokens : null;
  // clean once: template tokens the model may echo back never reach history
  content = cleanReply(rawContent);

  if (content.trim() || reasoning.trim()) {
    target.messages.push({
      id: assistantId,
      role: 'assistant',
      content,
      reasoning: reasoning || undefined,
      model: config.model.name,
      mode: body.mode || target.mode,
      aborted: aborted && content.length > 0 ? true : undefined,
      createdAt: Date.now(),
      stats: {
        seconds: Number(elapsed.toFixed(2)),
        tokens,
        tokensPerSecond: tokens ? Number((tokens / Math.max(elapsed, 0.001)).toFixed(1)) : null
      }
    });
    target.updatedAt = Date.now();
    await convStore.save();
  }

  if (!res.writableEnded && !res.destroyed) send('done', {
    conversationId: target.id,
    messageId: assistantId,
    content,
    reasoning: reasoning || null,
    title: target.title,
    aborted,
    stats: { seconds: Number(elapsed.toFixed(2)), tokens, tokensPerSecond: tokens ? Number((tokens / Math.max(elapsed, 0.001)).toFixed(1)) : null }
  });
  if (!res.writableEnded) res.end();
}

// --------------------------------------------------------------- API: projects
async function apiListProjects(res, session) {
  const items = projectStore.data.items
    .filter((p) => p.owner === session.token)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(({ docs, ...rest }) => ({ ...rest, docCount: (docs || []).length, docs: (docs || []).map((d) => ({ id: d.id, name: d.name, size: d.size })) }));
  sendJSON(res, 200, { items });
}

async function apiCreateProject(req, res, session) {
  let body = {};
  try { body = await readBody(req, 64 * 1024); } catch { /* empty */ }
  const now = Date.now();
  const project = {
    id: id(),
    owner: session.token,
    name: titleFrom(body.name || 'New project'),
    instructions: String(body.instructions || '').slice(0, 8000),
    docs: [],
    createdAt: now,
    updatedAt: now
  };
  projectStore.data.items.push(project);
  await projectStore.save();
  sendJSON(res, 201, { ...project, docs: [] });
}

async function apiGetProject(res, session, pid) {
  const p = projectStore.data.items.find((x) => x.id === pid && x.owner === session.token);
  if (!p) return sendJSON(res, 404, { error: 'not_found' });
  sendJSON(res, 200, {
    ...p,
    docs: (p.docs || []).map((d) => ({ id: d.id, name: d.name, size: d.size, addedAt: d.addedAt, preview: String(d.text || '').slice(0, 400) }))
  });
}

async function apiUpdateProject(req, res, session, pid) {
  const p = projectStore.data.items.find((x) => x.id === pid && x.owner === session.token);
  if (!p) return sendJSON(res, 404, { error: 'not_found' });
  let body = {};
  try { body = await readBody(req); } catch { return sendJSON(res, 400, { error: 'bad_request' }); }
  if (typeof body.name === 'string') p.name = titleFrom(body.name);
  if (typeof body.instructions === 'string') p.instructions = body.instructions.slice(0, 8000);
  p.updatedAt = Date.now();
  await projectStore.save();
  sendJSON(res, 200, { ok: true, project: { id: p.id, name: p.name, instructions: p.instructions } });
}

async function apiDeleteProject(res, session, pid) {
  const before = projectStore.data.items.length;
  projectStore.data.items = projectStore.data.items.filter((x) => !(x.id === pid && x.owner === session.token));
  if (projectStore.data.items.length === before) return sendJSON(res, 404, { error: 'not_found' });
  convStore.data.items.forEach((c) => { if (c.projectId === pid) c.projectId = null; });
  await Promise.all([projectStore.save(), convStore.save()]);
  sendJSON(res, 200, { ok: true });
}

async function apiAddProjectDoc(req, res, session, pid) {
  const p = projectStore.data.items.find((x) => x.id === pid && x.owner === session.token);
  if (!p) return sendJSON(res, 404, { error: 'not_found' });
  let body = {};
  try { body = await readBody(req); } catch { return sendJSON(res, 400, { error: 'bad_request' }); }
  if (!p.docs) p.docs = [];
  if (p.docs.length >= config.limits.maxKnowledgeFiles) {
    return sendJSON(res, 400, { error: 'too_many_files', message: `Max ${config.limits.maxKnowledgeFiles} documents per project` });
  }
  const doc = {
    id: id(),
    name: String(body.name || 'document.txt').slice(0, 160),
    size: String(body.text || '').length,
    text: String(body.text || '').slice(0, config.limits.maxTextExtract),
    addedAt: Date.now()
  };
  p.docs.push(doc);
  p.updatedAt = Date.now();
  await projectStore.save();
  sendJSON(res, 201, { id: doc.id, name: doc.name, size: doc.size, addedAt: doc.addedAt });
}

async function apiDeleteProjectDoc(res, session, pid, did) {
  const p = projectStore.data.items.find((x) => x.id === pid && x.owner === session.token);
  if (!p) return sendJSON(res, 404, { error: 'not_found' });
  const before = (p.docs || []).length;
  p.docs = (p.docs || []).filter((d) => d.id !== did);
  if (p.docs.length === before) return sendJSON(res, 404, { error: 'not_found' });
  p.updatedAt = Date.now();
  await projectStore.save();
  sendJSON(res, 200, { ok: true });
}

// ------------------------------------------------------------------- router
async function handleApi(req, res, session) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname.replace(/^\/api/, '') || '/';
  const parts = p.split('/').filter(Boolean);
  const method = req.method;

  // --- public endpoints
  if (p === '/health') {
    return sendJSON(res, 200, {
      ok: true,
      authed: Boolean(session),
      model: engine.info(),
      uptime: Math.floor(process.uptime()),
      version: require('./package.json').version
    });
  }
  if (p === '/login' && method === 'POST') return apiLogin(req, res);
  if (p === '/logout' && method === 'POST') return apiLogout(req, res, session);

  // --- everything below needs a session
  if (!session) {
    return sendJSON(res, 401, { error: 'unauthorized', message: 'Sign in required', messageAr: 'يجب تسجيل الدخول' });
  }

  if (p === '/me') {
    return sendJSON(res, 200, {
      authed: true,
      cookie: cookiePolicy(req),
      expiresAt: session.expiresAt,
      model: engine.info(),
      counts: {
        conversations: convStore.data.items.filter((c) => ownsConversation(c, session)).length,
        projects: projectStore.data.items.filter((x) => x.owner === session.token).length
      }
    });
  }

  if (p === '/engine/logs') {
    return sendJSON(res, 200, { state: engine.state, error: engine.error, log: engine.log.slice(-120) });
  }
  if (p === '/engine/props') {
    const props = await engine.props();
    return sendJSON(res, 200, {
      templateSource: props?.chat_template ? String(props.chat_template).slice(0, 400) : null,
      bosToken: props?.bos_token || null,
      eosToken: props?.eos_token || null,
      slots: props?.total_slots || null,
      build: props?.build_info || null
    });
  }
  if (p === '/engine/restart' && method === 'POST') {
    const info = await engine.restart();
    return sendJSON(res, 200, { ok: info.state === 'ready', model: info });
  }

  if (p === '/models') {
    return sendJSON(res, 200, { current: engine.info(), available: [config.model.name] });
  }

  if (parts[0] === 'conversations') {
    if (parts.length === 1 && method === 'GET') return apiListConversations(res, session);
    if (parts.length === 1 && method === 'POST') return apiCreateConversation(req, res, session);
    if (parts.length === 2 && method === 'GET') return apiGetConversation(res, session, parts[1]);
    if (parts.length === 2 && method === 'PATCH') return apiUpdateConversation(req, res, session, parts[1]);
    if (parts.length === 2 && method === 'DELETE') return apiDeleteConversation(res, session, parts[1]);
  }

  if (p === '/chat' && method === 'POST') return apiChat(req, res, session);

  if (parts[0] === 'projects') {
    if (parts.length === 1 && method === 'GET') return apiListProjects(res, session);
    if (parts.length === 1 && method === 'POST') return apiCreateProject(req, res, session);
    if (parts.length === 2 && method === 'GET') return apiGetProject(res, session, parts[1]);
    if (parts.length === 2 && method === 'PATCH') return apiUpdateProject(req, res, session, parts[1]);
    if (parts.length === 2 && method === 'DELETE') return apiDeleteProject(res, session, parts[1]);
    if (parts.length === 3 && parts[2] === 'docs' && method === 'POST') return apiAddProjectDoc(req, res, session, parts[1]);
    if (parts.length === 4 && parts[2] === 'docs' && method === 'DELETE') return apiDeleteProjectDoc(res, session, parts[1], parts[3]);
  }

  return sendJSON(res, 404, { error: 'not_found' });
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  // security headers that are safe for a same-origin SPA
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'same-origin');
  // No X-Frame-Options: the app is a plain same-origin SPA with no sensitive
  // framing story, and blocking framing breaks embedded previews.
  res.setHeader('content-security-policy', "frame-ancestors *");

  try {
    if (pathname.startsWith('/api/') || pathname === '/api') {
      const session = sessions.get(parseCookies(req.headers.cookie)[config.session.cookie]);
      return await handleApi(req, res, session);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJSON(res, 405, { error: 'method_not_allowed' });
    }
    return await serveStatic(req, res, pathname);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[server]', err);
    if (!res.headersSent) sendJSON(res, status, { error: err.message || 'server_error' });
    else res.end();
  }
}

// -------------------------------------------------------------------- boot
async function main() {
  await Promise.all([convStore.load(), projectStore.load(), sessionStore.load()]);
  sessions = new Sessions(sessionStore);
  guard = new LoginGuard();

  const server = http.createServer(handler);
  server.listen(config.port, config.host, () => {
    console.log('');
    console.log('  ✦ Kosmos AI');
    console.log(`  ├ listening   http://${config.host}:${config.port}`);
    console.log(`  ├ model       ${config.model.name} (${config.model.quant}) — ${path.basename(config.model.path)}`);
    console.log(`  ├ engine      llama.cpp @ 127.0.0.1:${config.engine.port}  ctx=${config.model.context}`);
    console.log(`  └ password    ${config.password ? 'set' : 'MISSING'}`);
    console.log('');
  });

  // warm the model in the background so the first message is fast
  engine.start().catch((err) => console.error('[engine]', err.message));

  const shutdown = async (sig) => {
    console.log(`\n[server] ${sig} — shutting down`);
    server.close();
    await engine.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) main();

module.exports = { handler, buildMessagesFor, titleFrom, cleanReply, stablePrefix };
