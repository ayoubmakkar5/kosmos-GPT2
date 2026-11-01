'use strict';
/**
 * Engine supervisor — owns the llama-server child process that runs
 * LFM3-1.7B, and exposes a tiny async client for it.
 *
 * Design notes
 *  - One process, started lazily, restarted on crash with backoff.
 *  - llama-server speaks the OpenAI wire format, so the rest of the app never
 *    needs to know it is llama.cpp underneath.
 *  - /health of llama-server reports {"status":"ok"} once the weights are
 *    mapped; we surface that as `ready`.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const config = require('./config');
const { LFM3_CHAT_TEMPLATE } = require('./chat-template');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Engine {
  constructor() {
    this.child = null;
    this.state = 'idle'; // idle | starting | ready | error | stopped
    this.error = null;
    this.startedAt = 0;
    this.readyAt = 0;
    this.restarts = 0;
    this.log = [];
    this._starting = null;
    this._lastRequest = 0;
    // Some checkpoints (Qwen3 family) default to a long hidden reasoning pass,
    // which leaves `content` empty when the token budget is small. The server
    // passes chat_template_kwargs per request instead, so nothing to do here.
  }

  // ---------------------------------------------------------------- logging
  _push(chunk) {
    const text = String(chunk);
    for (const line of text.split('\n')) {
      const clean = line.replace(/\u001b\[[0-9;]*m/g, '').trimEnd();
      if (!clean) continue;
      this.log.push(clean);
      if (this.log.length > 400) this.log.splice(0, this.log.length - 400);
      if (process.env.DEBUG) console.log('[engine]', clean);
    }
  }

  // ------------------------------------------------------------------ state
  info() {
    const cfg = config.model;
    return {
      name: cfg.name,
      vendor: cfg.vendor,
      params: cfg.params,
      quant: cfg.quant,
      context: config.engine.parallel * config.model.context,
      nativeContext: cfg.nativeContext,
      runtime: 'llama.cpp',
      // true only when the weights on disk really are the LFM3 checkpoint —
      // lets the tests (and the UI) be honest about a stand-in model
      isTargetModel: /lfm3/i.test(path.basename(config.model.path)),
      state: this.state,
      ready: this.state === 'ready',
      error: this.error,
      loadSeconds: this.readyAt ? Number(((this.readyAt - this.startedAt) / 1000).toFixed(1)) : null
    };
  }

  binaryExists() {
    try {
      fs.accessSync(config.engine.bin, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  modelExists() {
    try {
      return fs.statSync(config.model.path).size > 1024 * 1024;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------- lifecycle
  async start() {
    if (this.state === 'ready') return;
    if (this._starting) return this._starting;

    this._starting = (async () => {
      this.state = 'starting';
      this.error = null;
      this.startedAt = Date.now();

      if (!this.modelExists()) {
        this.state = 'error';
        this.error = `Model weights not found at ${config.model.path} — run: npm run model:download`;
        this._starting = null;
        return;
      }
      if (!this.binaryExists()) {
        this.state = 'error';
        this.error = `llama-server not found at ${config.engine.bin} — run: npm run engine:build`;
        this._starting = null;
        return;
      }

      // Refuse to start a model that cannot fit, instead of letting the kernel
      // OOM-kill the engine (or the whole app) mid-load. gpt-oss-20b needs
      // ~12.8 GB at MXFP4 and gpt-oss-120b ~63 GB; this box has 4 GB, so the
      // failure would otherwise be a silent hang or a SIGKILL with no clue
      // which knob to turn.
      const footprint = checkFootprint();
      if (!footprint.ok) {
        this.state = 'error';
        this.error = footprint.message;
        console.error('[engine] ' + footprint.message);
        this._starting = null;
        return;
      }
      if (footprint.warning) console.warn('[engine] ' + footprint.warning);

      const args = this._args();
      console.log(`[engine] starting LFM3 (${path.basename(config.model.path)}, ctx=${config.model.context})`);
      const child = spawn(config.engine.bin, args, {
        cwd: path.dirname(config.engine.bin),
        env: {
          ...process.env,
          LD_LIBRARY_PATH: `${path.dirname(config.engine.bin)}:${process.env.LD_LIBRARY_PATH || ''}`
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      this.child = child;

      child.stdout.on('data', (d) => this._push(d));
      child.stderr.on('data', (d) => this._push(d));

      child.on('exit', (code, signal) => {
        const wasReady = this.state === 'ready';
        this.child = null;
        if (this.state === 'stopped') return;
        this._push(`[supervisor] llama-server exited code=${code} signal=${signal}`);
        this.state = 'error';
        this.error = `llama-server exited (code ${code}). See /api/engine/logs`;
        if (wasReady) {
          // crash while serving: restart with backoff
          this.restarts += 1;
          const delay = Math.min(30000, 1500 * this.restarts);
          setTimeout(() => {
            this.state = 'idle';
            this.start().catch(() => {});
          }, delay).unref();
        }
      });

      // wait for readiness
      const deadline = Date.now() + config.engine.bootTimeoutMs;
      while (Date.now() < deadline) {
        if (this.state === 'error' && !this.child) break;
        if (await this._healthy()) {
          this.state = 'ready';
          this.readyAt = Date.now();
          this.restarts = 0;
          console.log(`[engine] ready in ${((this.readyAt - this.startedAt) / 1000).toFixed(1)}s`);
          break;
        }
        await sleep(400);
      }
      if (this.state !== 'ready' && this.state !== 'error') {
        this.state = 'error';
        this.error = `llama-server did not become ready within ${config.engine.bootTimeoutMs / 1000}s`;
      }
      this._starting = null;
    })();

    return this._starting;
  }

  _args() {
    const e = config.engine;
    const m = config.model;
    const args = [
      '-m', m.path,
      '--host', '127.0.0.1',
      '--port', String(e.port),
      '--ctx-size', String(m.context),
      '--threads', String(e.threads),
      '--threads-batch', String(e.threadsBatch),
      '--parallel', String(e.parallel),
      '--n-gpu-layers', String(e.gpuLayers),
      '--no-warmup',
      '--log-colors', 'off'
    ];
    if (e.flashAttn) args.push('--flash-attn', 'auto');
    if (e.jinja) args.push('--jinja');
    // Template precedence: explicit env > the GGUF's own embedded Jinja template.
    // LFM3 GGUFs ship a correct template, so we only override when asked.
    const tmpl = resolvedChatTemplateFile();
    if (tmpl) args.push('--chat-template-file', tmpl);
    if (e.reasoningFormat) args.push('--reasoning-format', e.reasoningFormat);
    args.push(...e.extraArgs);
    return args;
  }

  /** Resolve an optional --chat-template-file, writing the bundled fallback on demand. */
  async stop() {
    this.state = 'stopped';
    if (!this.child) return;
    const child = this.child;
    this.child = null;
    child.kill('SIGTERM');
    for (let i = 0; i < 40; i++) {
      if (child.exitCode !== null) return;
      await sleep(100);
    }
    if (child.exitCode === null) child.kill('SIGKILL');
  }

  async restart() {
    await this.stop();
    this.state = 'idle';
    this.error = null;
    this.restarts = 0;
    await this.start();
    return this.info();
  }

  // ------------------------------------------------------------- transport
  _healthy() {
    return new Promise((resolve) => {
      const req = http.request(
        { host: '127.0.0.1', port: config.engine.port, path: '/health', method: 'GET', timeout: 2500 },
        (res) => {
          let body = '';
          res.on('data', (d) => (body += d));
          res.on('end', () => {
            try {
              resolve(res.statusCode === 200 && JSON.parse(body).status !== 'loading');
            } catch {
              resolve(false);
            }
          });
        }
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    });
  }

  /** Raw JSON request to llama-server. */
  request(method, pathname, payload, timeoutMs = 180000) {
    return new Promise((resolve, reject) => {
      const data = payload ? Buffer.from(JSON.stringify(payload)) : null;
      const req = http.request(
        {
          host: '127.0.0.1',
          port: config.engine.port,
          path: pathname,
          method,
          timeout: timeoutMs,
          headers: data
            ? { 'content-type': 'application/json', 'content-length': data.length }
            : {}
        },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (d) => (body += d));
          res.on('end', () => {
            let json = null;
            try { json = JSON.parse(body); } catch { /* non-JSON */ }
            if (res.statusCode >= 400) {
              const msg = (json && (json.error?.message || json.error)) || body.slice(0, 400) || `HTTP ${res.statusCode}`;
              const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
              err.status = res.statusCode;
              return reject(err);
            }
            resolve(json ?? { raw: body });
          });
        }
      );
      req.on('timeout', () => { req.destroy(new Error('engine timeout')); });
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  /** What llama-server actually resolved as its template (useful for debugging). */
  async props() {
    try {
      return await this.request('GET', '/props', null, 8000);
    } catch {
      return null;
    }
  }

  /** Streaming completion. Yields deltas; resolves when done. */
  async *chatStream(payload, signal) {
    this._lastRequest = Date.now();
    const body = Buffer.from(JSON.stringify(payload));
    const res = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: config.engine.port,
          path: '/v1/chat/completions',
          method: 'POST',
          headers: { 'content-type': 'application/json', 'content-length': body.length }
        },
        resolve
      );
      req.on('error', reject);
      if (signal) {
        const onAbort = () => req.destroy(new Error('aborted'));
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      }
      req.write(body);
      req.end();
    });

    if (res.statusCode >= 400) {
      let text = '';
      for await (const chunk of res) text += chunk;
      let msg = text;
      try { msg = JSON.parse(text).error?.message || text; } catch { /* keep raw */ }
      throw new Error(msg.slice(0, 400) || `engine HTTP ${res.statusCode}`);
    }

    let buffer = '';
    for await (const chunk of res) {
      buffer += chunk.toString('utf8');
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of frame.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') return;
          try {
            yield JSON.parse(data);
          } catch { /* ignore partial */ }
        }
      }
    }
  }
}

/**
 * Will the weights plausibly fit in RAM? llama.cpp needs the file plus the KV
 * cache and runtime buffers, so the file size alone is not the budget. Compared
 * against MemAvailable, which is what the kernel will actually hand out.
 *
 * MODEL_SKIP_MEMORY_CHECK=1 overrides a refusal, for the odd machine (a shared
 * box, a model being mmapped from a fast disk) where the estimate is too
 * pessimistic.
 */
function checkFootprint() {
  if (process.env.MODEL_SKIP_MEMORY_CHECK === '1') return { ok: true };
  let fileBytes = 0;
  try {
    fileBytes = fs.statSync(config.model.path).size;
  } catch {
    return { ok: true }; // modelExists() already reported this case
  }
  const totalMB = Number(require('os').totalmem() / 1048576);
  const kvMB = estimateKvCacheMB();
  const needMB = Math.ceil((fileBytes / 1048576) * 1.05) + kvMB + 512; // + runtime buffers
  const headroomMB = totalMB - 700; // leave the OS and this process room to live

  if (needMB > headroomMB) {
    const gb = (n) => `${(n / 1024).toFixed(1)} GB`;
    return {
      ok: false,
      message:
        `not enough memory for ${path.basename(config.model.path)}: needs about ${gb(needMB)} ` +
        `(weights ${gb(fileBytes / 1048576)} + KV cache ${gb(kvMB)} + buffers), ` +
        `this machine has ${gb(totalMB)} total with no swap. ` +
        `Use a smaller quantisation, raise CTX_SIZE down, or set MODEL_SKIP_MEMORY_CHECK=1 to try anyway.`
    };
  }
  if (needMB > headroomMB * 0.85) {
    return { ok: true, warning: `tight fit: needs about ${Math.round(needMB)} MB of ${Math.round(totalMB)} MB available` };
  }
  return { ok: true };
}

/** Rough KV-cache size: bytes per token per layer, times the context. */
function estimateKvCacheMB() {
  const layers = Number(config.model.layers || 0);
  const ctx = Number(config.model.context || 8192);
  if (!layers) return Math.ceil((ctx / 8192) * 512); // assume ~0.5 GB per 8K
  // heads * headDim * 2 (K and V) * 2 bytes (f16) * layers * ctx
  const perTokenBytes = layers * 2 * 2 * 128 * 2;
  return Math.ceil((perTokenBytes * ctx) / 1048576);
}

/**
 * LFM3 GGUFs carry their own Jinja chat template, so by default we let
 * llama-server use it. Set ENGINE_CHAT_TEMPLATE=lfm3 (or a path) to force the
 * bundled template — useful for base/fine-tuned GGUFs that lost their template.
 */
function resolvedChatTemplateFile() {
  const want = config.engine.chatTemplate;
  if (!want || want === 'gguf' || want === 'embedded') return null;
  if (want && want !== 'lfm3' && fs.existsSync(want)) return want;
  const file = path.join(config.dataDir, 'lfm3-chat-template.jinja');
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== LFM3_CHAT_TEMPLATE) {
      fs.writeFileSync(file, LFM3_CHAT_TEMPLATE);
    }
    return file;
  } catch {
    return null;
  }
}

module.exports = new Engine();
module.exports.Engine = Engine;
module.exports.resolvedChatTemplateFile = resolvedChatTemplateFile;
module.exports.checkFootprint = checkFootprint;
