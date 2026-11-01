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

const MODEL_DEFAULT = process.env.MODEL_FILE
  ? path.resolve(ROOT, process.env.MODEL_FILE)
  : path.join(ROOT, 'models', 'LFM3-1.7B-Q4_K_M.gguf');

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
    name: process.env.MODEL_NAME || 'LFM3-1.7B',
    vendor: 'Liquid AI',
    quant: process.env.MODEL_QUANT || 'Q4_K_M',
    params: process.env.MODEL_PARAMS || '1.73B',
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
