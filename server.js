'use strict';
/**
 * Kosmos Code — AI coding web app powered by a REAL, locally-running Qwen3 model
 * (Qwen3-0.6B, Q4_K_M GGUF, executed by llama.cpp).
 *
 * Zero npm dependencies: plain Node.js http server + a child process running
 * llama-server (OpenAI-compatible API) on localhost.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

// ---------------------------------------------------------------------------
// Optional .env loading (no external dependencies)
// ---------------------------------------------------------------------------
(function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (e) {
    console.warn('[env] could not read .env:', e.message);
  }
})();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');

const MODEL_PATH = process.env.MODEL_PATH || path.join(ROOT, 'models', 'Qwen3-0.6B-Q4_K_M.gguf');
const MODEL_NAME = process.env.MODEL_NAME || 'Qwen3-0.6B';
const MODEL_QUANT = process.env.MODEL_QUANT || 'Q4_K_M';
const LLAMA_BIN =
  process.env.LLAMA_SERVER_BIN ||
  process.env.LLAMA_BIN ||
  path.join(ROOT, 'llama.cpp', 'build', 'bin', 'llama-server');

const LLAMA_PORT = Number(process.env.LLAMA_PORT || 8080);
const LLAMA_HOST = '127.0.0.1';
const CTX_SIZE = Number(process.env.CTX_SIZE || 4096);

const PASSWORD = process.env.APP_PASSWORD || 'Kosmos@2026';
const PASSWORD_HASH = sha256(PASSWORD);
const SESSION_SECRET = process.env.SESSION_SECRET || loadOrCreateSecret();
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

// ---------------------------------------------------------------------------
// Session secret: stable across restarts so logins are not lost on reboot
// ---------------------------------------------------------------------------
function loadOrCreateSecret() {
  const candidates = [path.join(__dirname, '.session-secret'), path.join(require('os').tmpdir(), 'kosmos-session-secret')];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const value = fs.readFileSync(file, 'utf8').trim();
        if (value.length >= 32) return value;
      }
    } catch {}
  }
  const secret = crypto.randomBytes(32).toString('hex');
  for (const file of candidates) {
    try {
      fs.writeFileSync(file, secret, { mode: 0o600 });
      return secret;
    } catch {}
  }
  console.warn('[session] using an ephemeral secret (logins will not survive a restart)');
  return secret;
}

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------
function sha256(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function sign(payload) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
}

function makeToken() {
  const exp = String(Date.now() + SESSION_TTL_MS);
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = `${exp}.${nonce}`;
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [exp, nonce, mac] = parts;
  const payload = `${exp}.${nonce}`;
  const expected = sign(payload);
  if (!safeEqual(mac, expected)) return false;
  return Number(exp) > Date.now();
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const piece of raw.split(';')) {
    const i = piece.indexOf('=');
    if (i < 0) continue;
    out[piece.slice(0, i).trim()] = decodeURIComponent(piece.slice(i + 1).trim());
  }
  return out;
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function isHttps(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return proto === 'https' || Boolean(req.socket.encrypted);
}

const loginAttempts = new Map(); // ip -> {count, first}

function loginAllowed(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || now - rec.first > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, first: now });
    return true;
  }
  rec.count += 1;
  return rec.count <= LOGIN_MAX_ATTEMPTS;
}

function loginSucceeded(ip) {
  loginAttempts.delete(ip);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function json(res, status, body, extraHeaders = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(data);
}

function readBody(req, limitBytes = 512 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

function isAuthed(req) {
  const cookies = parseCookies(req);
  if (verifyToken(cookies.km_session)) return true;
  // Fallback for embedded/preview frames where third-party cookies are blocked
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return verifyToken(auth.slice(7).trim());
  }
  if (verifyToken(req.headers['x-session-token'])) return true;
  return false;
}


// ---------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Unknown path without extension -> SPA entry point
      if (!path.extname(rel)) {
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, html) => {
          if (e2) res.writeHead(404).end('Not found');
          else {
            res.writeHead(200, {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-cache',
            });
            res.end(html);
          }
        });
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "frame-ancestors *",
    });
    res.end(data);
  });
}

// ---------------------------------------------------------------------------
// Model engine (llama.cpp / llama-server child process)
// ---------------------------------------------------------------------------
const engine = {
  proc: null,
  ready: false,
  starting: false,
  error: null,
  startedAt: null,
  pid: null,
  logs: [],
};

function logEngine(line) {
  const clean = String(line).trim();
  if (!clean) return;
  engine.logs.push(clean);
  if (engine.logs.length > 200) engine.logs.shift();
  if (process.env.DEBUG) console.log('[llama]', clean);
}

async function pingLlama(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: LLAMA_HOST, port: LLAMA_PORT, path: '/health', method: 'GET', timeout: timeoutMs },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function startEngine() {
  if (engine.starting || engine.ready) return;

  // If a llama-server is already listening (e.g. restarted app), adopt it.
  if (await pingLlama(1200)) {
    engine.ready = true;
    engine.starting = false;
    console.log('[engine] reusing already-running llama-server on port ' + LLAMA_PORT);
    return;
  }

  if (!fs.existsSync(MODEL_PATH)) {
    engine.error = `Model file not found: ${MODEL_PATH}`;
    console.error('[engine]', engine.error);
    return;
  }

  engine.starting = true;
  engine.error = null;
  engine.startedAt = Date.now();

  const args = [
    '-m', MODEL_PATH,
    '--host', LLAMA_HOST,
    '--port', String(LLAMA_PORT),
    '-c', String(CTX_SIZE),
    '-t', String(Math.max(1, require('os').cpus().length)),
    '--no-webui',
    '--jinja',
    '-np', '1',
    '--metrics',
  ];

  const useBin = fs.existsSync(LLAMA_BIN);
  const cmd = useBin ? LLAMA_BIN : 'llama-server';
  console.log(`[engine] starting: ${cmd} -m ${path.basename(MODEL_PATH)} (ctx=${CTX_SIZE})`);

  let proc;
  try {
    proc = spawn(cmd, args, {
      cwd: path.dirname(LLAMA_BIN),
      env: { ...process.env, LD_LIBRARY_PATH: path.dirname(LLAMA_BIN) + ':' + (process.env.LD_LIBRARY_PATH || '') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    engine.error = String(e);
    engine.starting = false;
    return;
  }

  engine.proc = proc;
  engine.pid = proc.pid;
  proc.stdout.on('data', (d) => String(d).split('\n').forEach(logEngine));
  proc.stderr.on('data', (d) => String(d).split('\n').forEach(logEngine));

  proc.on('error', (e) => {
    engine.error = `failed to spawn llama-server: ${e.message}`;
    engine.starting = false;
    engine.ready = false;
    console.error('[engine]', engine.error);
  });

  proc.on('exit', (code, sig) => {
    console.log(`[engine] llama-server exited code=${code} signal=${sig}`);
    engine.ready = false;
    engine.starting = false;
    engine.proc = null;
    engine.pid = null;
    if (code !== 0 && code !== null) {
      engine.error = engine.error || `llama-server exited with code ${code}`;
    }
  });

  // Poll readiness (model load on CPU takes a moment).
  const startedAt = Date.now();
  const timer = setInterval(async () => {
    if (!engine.proc) {
      clearInterval(timer);
      return;
    }
    const ok = await pingLlama(1200);
    if (ok) {
      clearInterval(timer);
      engine.ready = true;
      engine.starting = false;
      engine.error = null;
      engine.loadSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(1));
    console.log(`[engine] ready in ${engine.loadSeconds}s`);
    } else if (Date.now() - startedAt > 180000) {
      clearInterval(timer);
      engine.starting = false;
      engine.error = engine.error || 'model load timed out';
    }
  }, 700);
}

function stopEngine() {
  if (engine.proc) {
    try {
      engine.proc.kill('SIGTERM');
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// Messages building (Qwen3 chat template handled by llama-server + --jinja)
// ---------------------------------------------------------------------------
function buildMessages(messages, mode, lang) {
  const systemBase =
    'You are Kosmos Code, an expert AI programming assistant. ' +
    'You write clean, correct, runnable code and explain it briefly. ' +
    'When you give code, always wrap it in a fenced markdown block with the language tag, ' +
    'for example ```python ... ```. Prefer complete, copy-paste-ready solutions. ' +
    'Be concise.';

  const systemAr = lang === 'ar' ? ' أجب بالعربية واكتب الكود داخل كتلة ماركداون مع تحديد اللغة.' : '';

  const modeHint =
    mode === 'explain'
      ? ' Explain the code the user provides: what it does, the logic, complexity, and possible bugs.'
      : mode === 'debug'
      ? ' Find and fix the bug in the code the user provides. Show the corrected full code and a short explanation.'
      : ' Generate the code the user asks for, then briefly explain how it works.';

  const out = [{ role: 'system', content: systemBase + modeHint + systemAr }];
  for (const m of messages.slice(-20)) {
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const content = String(m.content || '').slice(0, 8000);
    if (!content.trim()) continue;
    out.push({ role, content });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Chat streaming endpoint (llama-server OpenAI-compatible /v1/chat/completions)
// ---------------------------------------------------------------------------
function callLlamaStream(messages, opts, onDelta, onDone, onError) {
  const payload = JSON.stringify({
    messages,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
    top_p: 0.95,
    top_k: 20,
    repeat_penalty: 1.05,
    cache_prompt: true,
    chat_template_kwargs: { enable_thinking: false },
  });

  const req = http.request(
    {
      host: LLAMA_HOST,
      port: LLAMA_PORT,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    },
    (res) => {
      if (res.statusCode !== 200) {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => onError(new Error(`llama-server ${res.statusCode}: ${body.slice(0, 300)}`)));
        return;
      }
      res.setEncoding('utf8');
      let buf = '';
      let usage = null;
      let finishReason = 'stop';
      let timings = null;
      res.on('data', (chunk) => {
        buf += chunk;
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const evt = JSON.parse(data);
            if (evt.usage) usage = evt.usage;
            if (evt.timings) timings = evt.timings;
            const choice = evt.choices && evt.choices[0];
            if (choice && choice.delta && choice.delta.content) onDelta(choice.delta.content);
            if (choice && choice.finish_reason) finishReason = choice.finish_reason;
            if (choice && choice.delta && choice.delta.reasoning_content) {
              // reasoning tokens are hidden from the user, but keep the stream alive
            }
          } catch {}
        }
      });
      res.on('end', () => onDone({ finish_reason: finishReason, usage, timings }));
    }
  );

  req.on('error', onError);
  req.write(payload);
  req.end();
  return req;
}

async function handleChat(req, res) {
  if (!isAuthed(req)) return json(res, 401, { error: 'unauthorized' });

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return json(res, 400, { error: 'bad request' });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length) return json(res, 400, { error: 'messages required' });

  if (!engine.ready) {
    return json(res, 503, {
      error: 'model_loading',
      message: engine.error || 'The Qwen model is still loading. Please retry in a moment.',
    });
  }

  const mode = ['code', 'explain', 'debug'].includes(body.mode) ? body.mode : 'code';
  const lang = body.lang === 'ar' ? 'ar' : 'en';
  const chatMessages = buildMessages(messages, mode, lang);

  stats.total++;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');
  res.write(`data: ${JSON.stringify({ ready: true })}\n\n`);

  let closed = false;
  let firstTokenAt = 0;
  const t0 = Date.now();

  const heartbeat = setInterval(() => {
    if (!closed) res.write(': ping\n\n');
  }, 15000);

  res.on('close', () => {
    closed = true;
    clearInterval(heartbeat);
    if (upstream) upstream.destroy();
  });

  let upstream = callLlamaStream(
    chatMessages,
    {
      maxTokens: Math.max(64, Math.min(Number(body.maxTokens) || 512, 1024)),
      temperature: typeof body.temperature === 'number' ? Math.min(Math.max(body.temperature, 0), 1.5) : 0.6,
    },
    (delta) => {
      if (closed) return;
      if (!firstTokenAt) firstTokenAt = Date.now();
      res.write(`data: ${JSON.stringify({ delta })}\n\n`);
    },
    (final) => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      const elapsed = (Date.now() - t0) / 1000;
      const metrics = {
        elapsed,
        ttft: firstTokenAt ? (firstTokenAt - t0) / 1000 : null,
        tokens:
          final && final.timings && final.timings.predicted_n
            ? final.timings.predicted_n
            : final && final.usage
            ? final.usage.completion_tokens
            : undefined,
        tokPerSec:
          final && final.timings && final.timings.predicted_per_second
            ? Number(final.timings.predicted_per_second.toFixed(1))
            : final && final.usage && final.usage.completion_tokens
            ? Number((final.usage.completion_tokens / Math.max(elapsed, 0.001)).toFixed(1))
            : undefined,
      };
      res.write(`data: ${JSON.stringify({ done: true, stats: metrics })}\n\n`);
      res.end();
    },
    (err) => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      console.error('[chat]', err.message);
      const message =
        /ECONNREFUSED|socket hang up|ECONNRESET/.test(err.message)
          ? 'The model engine restarted. Please send your request again.'
          : err.message;
      res.write(`data: ${JSON.stringify({ error: 'inference_failed', message })}\n\n`);
      res.end();
    }
  );
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const stats = { total: 0, logins: 0, started: Date.now() };


const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  // --- API -----------------------------------------------------------------
  if (p === '/api/health') {
    return json(res, 200, {
      ok: true,
      model_ready: engine.ready,
      model_loading: engine.starting,
      model: { name: MODEL_NAME, quant: MODEL_QUANT, engine: 'llama.cpp', ctx: CTX_SIZE },
      load_seconds: engine.loadSeconds || null,
      error: engine.error,
      passwords_set: Boolean(PASSWORD),
    });
  }

  if (p === '/api/login' && req.method === 'POST') {
    const ip = clientIp(req);
    if (!loginAllowed(ip)) {
      return json(res, 429, { error: 'too_many_attempts', message: 'Too many attempts. Try again later.' });
    }
    let body;
    try {
      body = await readBody(req, 4096);
    } catch {
      return json(res, 400, { error: 'bad_request' });
    }
    const given = typeof body.password === 'string' ? body.password : '';
    if (!safeEqual(sha256(given), PASSWORD_HASH)) {
      return json(res, 401, { error: 'invalid_password', message: 'كلمة السر غير صحيحة' });
    }
    loginSucceeded(ip);
    stats.logins++;
    const token = makeToken();
    const secure = isHttps(req) ? '; Secure' : '';
    const maxAge = Math.floor(SESSION_TTL_MS / 1000);
    const cookie = `km_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
    // SameSite=None keeps the session alive inside embedded preview frames (requires Secure)
    const cookies = [cookie];
    if (secure) {
      cookies.push(
        `km_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=None; Max-Age=${maxAge}${secure}`
      );
    }
    return json(res, 200, { ok: true, token, expiresIn: maxAge }, { 'Set-Cookie': cookies });
  }

  if (p === '/api/logout' && req.method === 'POST') {
    return json(
      res,
      200,
      { ok: true },
      { 'Set-Cookie': 'km_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' }
    );
  }

  if (p === '/api/me') {
    const authed = isAuthed(req);
    return json(res, 200, {
      authed,
      model: { name: MODEL_NAME, quant: MODEL_QUANT, engine: 'llama.cpp', ctx: CTX_SIZE },
      engine: { ready: engine.ready, loading: engine.starting, error: engine.error },
      stats,
    });
  }

  if (p === '/api/chat' && req.method === 'POST') {
    return handleChat(req, res);
  }

  if (p === '/api/stats') {
    return json(res, 200, { ...stats, uptime: (Date.now() - stats.started) / 1000 });
  }

  // --- API: unknown endpoints / wrong methods ------------------------------
  if (p.startsWith('/api/')) {
    const known = ['/api/health', '/api/login', '/api/logout', '/api/me', '/api/chat', '/api/stats'];
    if (known.includes(p)) return json(res, 405, { error: 'method_not_allowed' });
    return json(res, 404, { error: 'not_found' });
  }

  // --- Pages ---------------------------------------------------------------
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { error: 'method_not_allowed' });
  }

  return serveStatic(req, res, p);
});

server.listen(PORT, HOST, () => {
  console.log(`\n  ⚡ Kosmos Code running at http://${HOST}:${PORT}`);
  console.log(`  🔐 password protection: ON`);
  console.log(`  🧠 model: ${MODEL_NAME} (${MODEL_QUANT} GGUF) via llama.cpp\n`);
  startEngine();
});

process.on('SIGINT', () => {
  stopEngine();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopEngine();
  process.exit(0);
});
