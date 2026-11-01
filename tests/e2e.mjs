#!/usr/bin/env node
/**
 * Kosmos AI — end-to-end suite (zero dependencies).
 *
 *   node tests/e2e.mjs                                   # against :3000
 *   BASE=http://127.0.0.1:3000 MODEL=gpt-oss-120b node tests/e2e.mjs
 *   SKIP_CHAT=1 node tests/e2e.mjs                       # skip the model tests
 *
 * Exit code 0 only when every check passes.
 */
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const PASSWORD = process.env.PASSWORD || process.env.APP_PASSWORD || 'Kosmos@2026';
const SKIP_CHAT = process.env.SKIP_CHAT === '1';
const RUN_CHAT = !SKIP_CHAT;

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, extra = '') {
  pass++;
  console.log(`  \x1b[32m✓\x1b[0m ${name}${extra ? `  \x1b[90m${extra}\x1b[0m` : ''}`);
}
function bad(name, detail) {
  fail++;
  failures.push(`${name} — ${detail}`);
  console.log(`  \x1b[31m✗\x1b[0m ${name}  \x1b[31m${detail}\x1b[0m`);
}
function check(name, cond, detail = '') {
  if (cond) ok(name, detail);
  else bad(name, detail || 'assertion failed');
}
function group(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

let cookie = '';

async function req(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual'
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  if (raw) return res;
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: res.status, json, text, headers: res.headers };
}

/** Read an SSE response and collect events. */
async function stream(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body)
  });
  const events = [];
  if (!res.ok) {
    const text = await res.text();
    return { status: res.status, events, body: text };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = 'message';
      let data = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      try { events.push({ event, data: JSON.parse(data) }); } catch { /* ignore */ }
    }
  }
  return { status: res.status, events };
}

const textOf = (events) => events.filter((e) => e.event === 'delta').map((e) => e.data.text).join('');
const hasCodeFence = (s) => /```/.test(s);

async function main() {
  console.log(`\n\x1b[1mKosmos AI — e2e\x1b[0m  ${BASE}\n`);

  // ───────────────────────────────────────── template-marker cleanup units
  // LFM3 stops on <|im_end|>, so its answer never contains markers. A fine-tune
  // that lost the template can keep talking and replay the prompt instead; the
  // serverside cleaner must keep the answer and drop only the markers.
  group('Answer cleaning (unit)');
  {
    const { cleanReply, stablePrefix } = await import('../server.js');
    check('keeps a clean answer untouched', cleanReply('Hello there!') === 'Hello there!');
    check('keeps the answer when the model replays the prompt',
      cleanReply('Hello there!<|im_end|><|im_start|>user what is 2+2<|im_end|>') === 'Hello there!',
      JSON.stringify(cleanReply('Hello there!<|im_end|><|im_start|>user what is 2+2<|im_end|>')));
    check('strips a bare end marker', cleanReply('مرحبا<|im_end|>') === 'مرحبا');
    check('drops an echoed system turn', cleanReply('<|im_start|>system rules<|im_end|>Hi') === 'Hi');
    check('strips a leading role prefix', cleanReply('assistant: Hi') === 'Hi');
    check('plain "<" in prose survives', cleanReply('if a < b then') === 'if a < b then');
    check('holds back a half-received marker', stablePrefix('hello <|im_en') === 'hello ');
    check('lets a real "<" through immediately', stablePrefix('a < b') === 'a < b');
  }

  // ─────────────────────────────────────────────────────────── static + auth
  group('Static app');
  {
    const res = await req('/', { raw: true });
    const html = await res.text();
    check('GET / → 200', res.status === 200, `status ${res.status}`);
    check('serves the app shell', /<title>Kosmos AI<\/title>/.test(html));
    check('references app.js', /\/app\.js\?v=/.test(html));
    check('references styles.css', /\/styles\.css\?v=/.test(html));
    check('Arabic RTL default', /<html lang="ar" dir="rtl">/.test(html));
    check('no inline secrets in the shell', !/Kosmos@2026/.test(html));
    const css = await req('/styles.css', { raw: true });
    check('GET /styles.css → 200', css.status === 200);
    const js = await req('/app.js', { raw: true });
    check('GET /app.js → 200', js.status === 200);
    const ico = await req('/favicon.svg', { raw: true });
    check('GET /favicon.svg → 200', ico.status === 200 && /svg/.test(ico.headers.get('content-type') || ''));
  }

  group('Password gate');
  {
    const anon = await req('/api/me');
    check('anonymous /api/me → 401', anon.status === 401, `status ${anon.status}`);

    const wrong = await req('/api/login', { method: 'POST', body: { password: 'definitely-wrong' } });
    check('wrong password → 401', wrong.status === 401, `status ${wrong.status}`);
    check('wrong password returns no cookie', !cookie);

    const badBody = await req('/api/login', { method: 'POST', body: {} });
    check('empty password → 401', badBody.status === 401);

    const good = await req('/api/login', { method: 'POST', body: { password: PASSWORD, persistent: true } });
    check('correct password → 200', good.status === 200, `status ${good.status}`);
    check('session cookie issued', Boolean(cookie), cookie ? 'HttpOnly cookie set' : 'no cookie');
    check('cookie is opaque (not the password)', cookie && !cookie.toLowerCase().includes('kosmos%402026') && !cookie.toLowerCase().includes('kosmos@2026'));

    const me = await req('/api/me');
    check('/api/me after login → 200', me.status === 200);
    check('/api/me reports authed', me.json && me.json.authed === true);
    check('/api/me reports a model', Boolean(me.json?.model?.name), me.json?.model?.name);

    const upper = await req('/api/login', { method: 'POST', body: { password: PASSWORD.toUpperCase() } });
    check('password is case-insensitive', upper.status === 200, `status ${upper.status}`);
  }

  group('API validation');
  {
    const notFound = await req('/api/nope');
    check('unknown API path → 404', notFound.status === 404, `status ${notFound.status}`);

    const badJson = await req('/api/conversations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: undefined
    });
    check('create without body still works', badJson.status === 201 || badJson.status === 200, `status ${badJson.status}`);

    const wrongMethod = await req('/api/login', { method: 'GET' });
    check('GET /api/login → 404 (no handler)', wrongMethod.status === 404, `status ${wrongMethod.status}`);

    const missing = await req('/api/conversations/does-not-exist');
    check('missing conversation → 404', missing.status === 404);
  }

  // ─────────────────────────────────────────────────────── conversations CRUD
  group('Conversations');
  let convId = null;
  {
    const created = await req('/api/conversations', { method: 'POST', body: { mode: 'chat' } });
    check('create conversation → 201', created.status === 201, `status ${created.status}`);
    convId = created.json?.id;
    check('conversation has an id', Boolean(convId));
    check('default mode is chat', created.json?.mode === 'chat', created.json?.mode);

    const list = await req('/api/conversations');
    check('list includes it', Array.isArray(list.json?.items) && list.json.items.some((c) => c.id === convId));

    const patched = await req(`/api/conversations/${convId}`, { method: 'PATCH', body: { title: 'Titre de test', mode: 'code' } });
    check('rename + mode change → 200', patched.status === 200);
    check('title updated', patched.json?.title === 'Titre de test');
    check('mode updated', patched.json?.mode === 'code');

    const got = await req(`/api/conversations/${convId}`);
    check('read back → 200', got.status === 200);
    check('persisted title', got.json?.title === 'Titre de test');
  }

  // ───────────────────────────────────────────────────────────────── projects
  group('Projects');
  let projectId = null;
  {
    const created = await req('/api/projects', { method: 'POST', body: { name: 'Alpha', instructions: 'Always answer in French.' } });
    check('create project → 201', created.status === 201, `status ${created.status}`);
    projectId = created.json?.id;
    check('project id returned', Boolean(projectId));

    const doc = await req(`/api/projects/${projectId}/docs`, {
      method: 'POST',
      body: { name: 'notes.txt', text: 'The launch code is ORANGE-42.' }
    });
    check('add knowledge doc → 201', doc.status === 201, `status ${doc.status}`);
    const docId = doc.json?.id;

    const got = await req(`/api/projects/${projectId}`);
    check('project has 1 doc', got.json?.docs?.length === 1, `count ${got.json?.docs?.length}`);
    check('doc preview stored', /ORANGE-42/.test(got.json?.docs?.[0]?.preview || ''));

    const patched = await req(`/api/projects/${projectId}`, { method: 'PATCH', body: { name: 'Alpha 2' } });
    check('rename project → 200', patched.status === 200);

    if (docId) {
      const del = await req(`/api/projects/${projectId}/docs/${docId}`, { method: 'DELETE' });
      check('delete doc → 200', del.status === 200);
      const after = await req(`/api/projects/${projectId}`);
      check('doc removed', (after.json?.docs || []).length === 0);
    }
  }

  // ────────────────────────────────────────────────────────────────── engine
  group('Engine');
  {
    const health = await req('/api/health');
    check('GET /api/health → 200', health.status === 200);
    check('ok flag', health.json?.ok === true);
    const model = health.json?.model || {};
    console.log(`      \x1b[90mmodel: ${model.name} ${model.quant || ''} · state=${model.state} · ctx=${model.context}\x1b[0m`);

    if (RUN_CHAT) {
      check('model is ready', model.ready === true, `state=${model.state} ${model.error || ''}`);
      const logs = await req('/api/engine/logs');
      check('engine logs reachable', logs.status === 200 && Array.isArray(logs.json?.log));
    } else {
      ok('SKIP_CHAT set — model readiness not asserted');
    }
  }

  // ─────────────────────────────────────────────────────────────────── chat
  if (RUN_CHAT) {
    group('Chat streaming');
    {
      const first = await stream('/api/chat', {
        conversationId: convId,
        message: 'مرحبا، من أنت؟ أجب في جملة واحدة.',
        mode: 'chat',
        lang: 'ar',
        maxTokens: 120
      });
      check('stream → 200', first.status === 200, `status ${first.status}`);
      const kinds = first.events.map((e) => e.event);
      check('emits start', kinds.includes('start'));
      check('emits deltas', kinds.filter((k) => k === 'delta').length > 0, `${kinds.filter((k) => k === 'delta').length} deltas`);
      check('emits done', kinds.includes('done'));
      const start = first.events.find((e) => e.event === 'start');
      check('start carries the assistant message id', Boolean(start?.data?.messageId));
      const text = textOf(first.events);
      console.log(`      \x1b[90mreply: ${text.replace(/\s+/g, ' ').slice(0, 110)}\x1b[0m`);
      check('reply is not empty', text.trim().length > 0);
      check('greeting does not return code', !hasCodeFence(text), hasCodeFence(text) ? 'got a fenced block' : 'clean prose');

      const done = first.events.find((e) => e.event === 'done');
      check('done carries the full content', Boolean(done?.data?.content?.length > 0));
      check('done content matches the streamed text', done?.data?.content === text,
        done?.data?.content === text ? '' : 'stream and final differ (template markers cleaned)');
      check('conversation title was generated', Boolean(done?.data?.title));

      check('no template markers leak into the answer', !/<\|im_(start|end)\|>/.test(text), text.slice(0, 60));

      const conv = await req(`/api/conversations/${convId}`);
      check('history stored 2 messages', conv.json?.messages?.length === 2, `count ${conv.json?.messages?.length}`);
      check('stored user message matches', conv.json?.messages?.[0]?.content?.includes('مرحبا'));
      const stored = conv.json?.messages?.[1]?.content || '';
      check('stored assistant message matches', stored === text || stored === (first.events.find((e) => e.event === 'done') || {}).data?.content);

      // code mode must actually produce a fenced block
      const codeConv = await req('/api/conversations', { method: 'POST', body: { mode: 'code' } });
      const codeRes = await stream('/api/chat', {
        conversationId: codeConv.json.id,
        message: 'Write a Python function is_even(n). Code only.',
        mode: 'code',
        lang: 'en',
        maxTokens: 220
      });
      const codeText = textOf(codeRes.events);
      console.log(`      \x1b[90mcode reply: ${codeText.replace(/\s+/g, ' ').slice(0, 110)}\x1b[0m`);
      check('code mode returns an answer', codeText.trim().length > 0);

      const params = (codeRes.events.find((e) => e.event === 'start') || {}).data?.model || {};
      if (params.isTargetModel) {
        check('code mode returns a fenced block', hasCodeFence(codeText), codeText.slice(0, 90));
      } else {
        ok(`fence check skipped — running ${params.name || 'a stand-in'}, not LFM3 weights`);
        check('stand-in did not leak template markers', !/<\|im_end\|>/.test(codeText), 'clean');
      }
      await req(`/api/conversations/${codeConv.json.id}`, { method: 'DELETE' });
    }
  }

  // ─────────────────────────────────────────────────────────────── isolation
  group('Session isolation');
  {
    const before = cookie;
    // a second "browser": no cookie
    const oldCookie = cookie;
    cookie = '';
    const anonList = await req('/api/conversations');
    check('second client is anonymous → 401', anonList.status === 401, `status ${anonList.status}`);
    cookie = oldCookie;

    // a forged cookie must not authenticate
    const forgedCookie = oldCookie;
    cookie = 'kosmos_sid=forged-token-value';
    const forged = await req('/api/me');
    check('forged cookie → 401', forged.status === 401, `status ${forged.status}`);
    cookie = forgedCookie;

    check('original session still valid', (await req('/api/me')).status === 200);

    // another session must not see my conversations
    const res2 = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: PASSWORD })
    });
    const otherCookie = (res2.headers.get('set-cookie') || '').split(';')[0];
    const otherList = await fetch(`${BASE}/api/conversations`, { headers: { cookie: otherCookie } }).then((r) => r.json());
    check('second session cannot see the first session’s chats', otherList.items.length === 0, `${otherList.items.length} leaked`);

    const foreign = await fetch(`${BASE}/api/conversations/${convId}`, { headers: { cookie: otherCookie } });
    check('second session cannot read a foreign conversation', foreign.status === 404, `status ${foreign.status}`);
  }

  // ──────────────────────────────────────────────────────────────── teardown
  group('Cleanup');
  {
    if (convId) {
      const del = await req(`/api/conversations/${convId}`, { method: 'DELETE' });
      check('delete conversation → 200', del.status === 200);
      const gone = await req(`/api/conversations/${convId}`);
      check('conversation is gone', gone.status === 404);
    }
    if (projectId) {
      const del = await req(`/api/projects/${projectId}`, { method: 'DELETE' });
      check('delete project → 200', del.status === 200);
    }
    const out = await req('/api/logout', { method: 'POST' });
    check('logout → 200', out.status === 200);
    cookie = '';
    const after = await req('/api/me');
    check('session invalid after logout', after.status === 401, `status ${after.status}`);
  }

  // ───────────────────────────────────────────────────────────────── summary
  const total = pass + fail;
  console.log(`\n\x1b[1m${pass}/${total} checks passed\x1b[0m`);
  if (fail) {
    console.log('\x1b[31mFailures:\x1b[0m');
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exit(1);
  }
  console.log('\x1b[32mAll good.\x1b[0m\n');
}

main().catch((err) => {
  console.error('\x1b[31mSuite crashed:\x1b[0m', err);
  process.exit(2);
});
