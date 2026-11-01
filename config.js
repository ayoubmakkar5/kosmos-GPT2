'use strict';
/**
 * Kosmos AI — configuration.
 *
 * Everything is overridable by environment variable so the same image runs on a
 * laptop (CPU, small context) and on a GPU box (big context, many slots)
 * without touching a line of code.
 */
const path = require('path');
const os = require('os');

const ROOT = __dirname;

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function flag(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return !/^(0|false|no|off)$/i.test(String(value));
}

const fs = require('fs');

/**
 * Pick the model file: an explicit MODEL_FILE wins, otherwise prefer the LFM3
 * checkpoint and fall back to whatever single GGUF is sitting in models/.
 */
function resolveModelFile() {
  if (process.env.MODEL_FILE) return path.resolve(ROOT, process.env.MODEL_FILE);
  const dir = path.join(ROOT, 'models');
  const preferred = ['LFM3-1.7B-Q4_K_M.gguf', 'LFM3-1.7B-Q5_K_M.gguf', 'LFM3-1.7B-Q8_0.gguf'];
  for (const name of preferred) {
    const p = path.join(dir, name);
    try { if (fs.statSync(p).size > 1e8) return p; } catch { /* next */ }
  }
  try {
    const ggufs = fs.readdirSync(dir).filter((f) => f.endsWith('.gguf'));
    const lfm3 = ggufs.find((f) => /lfm3/i.test(f));
    if (lfm3) return path.join(dir, lfm3);
    if (ggufs.length) {
      // deterministic: the biggest one is the most capable
      const best = ggufs
        .map((f) => [f, fs.statSync(path.join(dir, f)).size])
        .sort((a, b) => b[1] - a[1])[0][0];
      return path.join(dir, best);
    }
  } catch { /* empty dir */ }
  return path.join(dir, 'LFM3-1.7B-Q4_K_M.gguf');
}

const MODEL_DEFAULT = resolveModelFile();

/** "models/Qwen3-0.6B-Q4_K_M.gguf" → "Qwen3-0.6B" */
function nameFromFile(file) {
  const base = path.basename(file, '.gguf');
  return base.replace(/[-_.](Q\d.*|iq\d.*|f16|bf16|f32|fp16)$/i, '') || base;
}

/**
 * Who trained the weights, inferred from the file name. Reported to the UI, so
 * it must not be a constant: this said "Liquid AI" for every model, which
 * attributed Qwen3 — an Alibaba model — to Liquid AI.
 */
function vendorFromFile(file) {
  const name = nameFromFile(file);
  if (/qwen/i.test(name)) return 'Alibaba (Qwen)';
  if (/lfm/i.test(name)) return 'Liquid AI';
  if (/llama|mistral|mixtral|gemma|phi|deepseek|smollm/i.test(name)) {
    const m = name.match(/llama|mistral|mixtral|gemma|phi|deepseek|smollm/i);
    return m[0][0].toUpperCase() + m[0].slice(1).toLowerCase();
  }
  return 'unknown';
}

const config = {
  root: ROOT,
  publicDir: path.join(ROOT, 'public'),
  dataDir: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data'),

  host: process.env.HOST || '0.0.0.0',
  port: num(process.env.PORT, 3000),

  // The password gate. Case-insensitive comparison is intentional: typing
  // "KOSMOS@2026" on an Arabic keyboard layout must still work.
  password: process.env.APP_PASSWORD || 'Kosmos@2026',

  session: {
    cookie: 'kosmos_sid',
    ttlHours: num(process.env.SESSION_TTL_HOURS, 24 * 30),
    maxSessions: num(process.env.SESSION_MAX, 200),
    // simple brute-force guard: N attempts per window per IP
    loginWindowMs: 10 * 60 * 1000,
    loginMaxAttempts: num(process.env.LOGIN_MAX_ATTEMPTS, 10)
  },

  model: {
    path: MODEL_DEFAULT,
    // Show the truth: name comes from the file actually loaded, not a guess.
    // The vendor is derived from that name for the same reason — this was
    // hardcoded to "Liquid AI" and so labelled Qwen3, an Alibaba model, as
    // Liquid AI's. A model card that lies about itself is worse than no card.
    name: process.env.MODEL_NAME || nameFromFile(MODEL_DEFAULT),
    vendor: process.env.MODEL_VENDOR || vendorFromFile(MODEL_DEFAULT),
    quant: process.env.MODEL_QUANT || 'Q4_K_M',
    // Qwen3-0.6B is 0.752B total / 0.596B non-embedding, hence the "0.6B".
    params: process.env.MODEL_PARAMS || (/lfm3/i.test(MODEL_DEFAULT) ? '1.73B' : /qwen3/i.test(MODEL_DEFAULT) ? '0.6B' : 'unknown'),
    nativeContext: num(process.env.MODEL_NATIVE_CTX, 262144),
    // runtime context: 8K by default — 256K needs ~1.6 GB of KV cache alone
    context: num(process.env.CTX_SIZE, 8192),
    sha256: (process.env.MODEL_SHA256 || '').toLowerCase(),
    // generation stops on any chat marker, whatever the weights were trained with
    stop: (process.env.MODEL_STOP || '<|im_end|>,<|im_start|>,<|endoftext|>').split(',').filter(Boolean),
    recommend: {
      temperature: Number(process.env.MODEL_TEMPERATURE || 0.3),
      topK: Number(process.env.MODEL_TOP_K || 50),
      repetitionPenalty: Number(process.env.MODEL_REPEAT_PENALTY || 1.1)
    }
  },

  engine: {
    bin: process.env.LLAMA_SERVER_BIN || path.join(ROOT, 'llama.cpp', 'build', 'bin', 'llama-server'),
    port: num(process.env.ENGINE_PORT, 8081),
    threads: num(process.env.ENGINE_THREADS, Math.max(1, Math.min(os.cpus().length, 8))),
    threadsBatch: num(process.env.ENGINE_THREADS_BATCH, Math.max(1, Math.min(os.cpus().length, 8))),
    parallel: num(process.env.ENGINE_PARALLEL, 1),
    gpuLayers: process.env.ENGINE_GPU_LAYERS === undefined ? 0 : Number(process.env.ENGINE_GPU_LAYERS),
    flashAttn: flag(process.env.ENGINE_FLASH_ATTN, true),
    jinja: flag(process.env.ENGINE_JINJA, true),
    reasoningFormat: process.env.ENGINE_REASONING_FORMAT || 'deepseek',
    // 'gguf' (default) = use the template embedded in the weights,
    // 'lfm3' = force the bundled LFM3 template, or an absolute path.
    chatTemplate: process.env.ENGINE_CHAT_TEMPLATE || 'gguf',
    extraArgs: (process.env.ENGINE_EXTRA_ARGS || '').split(' ').filter(Boolean),
    bootTimeoutMs: num(process.env.ENGINE_BOOT_TIMEOUT_MS, 180000)
  },

  limits: {
    maxBodyBytes: num(process.env.MAX_BODY_BYTES, 24 * 1024 * 1024), // attachments
    maxUploadBytes: num(process.env.MAX_UPLOAD_BYTES, 12 * 1024 * 1024),
    maxPromptChars: num(process.env.MAX_PROMPT_CHARS, 120000),
    maxConversations: num(process.env.MAX_CONVERSATIONS, 400),
    maxKnowledgeFiles: num(process.env.MAX_KNOWLEDGE_FILES, 40),
    maxTextExtract: num(process.env.MAX_TEXT_EXTRACT, 60000)
  }
};

module.exports = config;
