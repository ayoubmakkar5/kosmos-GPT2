# Kosmos AI — LFM3-1.7B

**A password-protected chat workspace that runs Liquid AI's LFM3-1.7B on your own machine.**
No API keys, no cloud inference: `llama.cpp` loads the real GGUF weights and answers on the CPU.

<div dir="rtl">

**مساحة محادثة محمية بكلمة سر، تشغّل نموذج LFM3-1.7B من Liquid AI محلياً.**
بلا مفاتيح API وبلا خدمات سحابية: محرّك `llama.cpp` يحمّل الأوزان الحقيقية ويجيب على المعالج.

</div>

---

## Why LFM3-1.7B

| | |
|---|---|
| Parameters | 1.73B (tri-hybrid: gated short convolutions + sliding-window + global attention) |
| Memory at 4-bit | ≈ 1 GB of weights — this repo's default `Q4_K_M` is 1.12 GB |
| Native context | 256K tokens (the app runs 8K by default; raise `CTX_SIZE`) |
| Languages | 16, **including Arabic** |
| Published scores | 49.37 average over 29 benchmarks (above Qwen3.5-9B's 47.24, per Liquid AI) |
| License | LFM Open License v1.0 — free commercial use under $10M revenue |

> Known weak spots, per Liquid's own report and independent testing: broad world knowledge and agentic coding. It is strong at conversation, instruction following, structured output and tool calls.

## Features

- **Streaming chat** over SSE, with a stop button that keeps what already streamed
- **Modes**: conversation (default), code, explain, debug — each with its own system prompt
- **Artifacts**: a side panel that opens any fenced code block, with syntax highlighting, copy, download, and a sandboxed live preview for HTML/CSS/JS
- **Projects**: reusable instruction sets plus knowledge documents injected into every chat in that project
- **Attachments**: text/code files are inlined; images are sent to the model's vision slot when a multimodal projector is configured
- **Think-on-demand**: `--reasoning-format deepseek` plumbing is wired, the UI shows reasoning in a collapsible block
- **Arabic-first UI** (RTL) with an instant English toggle
- **Password gate** with server-side sessions, HttpOnly cookie, sliding expiry and a brute-force limiter
- **Zero runtime dependencies** — pure Node `http`, no Express, no bundler

## Quick start

```bash
# 1. build llama.cpp v0.8.0 (the first release that knows the `lfm3` architecture)
bash scripts/build-engine.sh

# 2. fetch the weights from Hugging Face (~1.1 GB)
bash scripts/download-model.sh

# 3. run
APP_PASSWORD='Kosmos@2026' npm start
# → http://localhost:3000
```

The first launch compiles for a few minutes; after that the model loads in ~2 s.

### Docker

```bash
docker build -t kosmos-ai .
docker run -p 3000:3000 -e APP_PASSWORD='Kosmos@2026' kosmos-ai
```

## Configuration

Everything is an environment variable (see `config.js`).

| Variable | Default | Notes |
|---|---|---|
| `APP_PASSWORD` | `Kosmos@2026` | compared case-insensitively on purpose |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | |
| `MODEL_FILE` | `models/LFM3-1.7B-Q4_K_M.gguf` | any LFM3 GGUF works |
| `CTX_SIZE` | `8192` | 256K costs ≈1.6 GB of KV cache — raise only if you have the RAM |
| `ENGINE_THREADS` | CPU count | generation speed is roughly linear in cores |
| `ENGINE_GPU_LAYERS` | `0` | set to `99` on a CUDA/Metal build |
| `ENGINE_PARALLEL` | `1` | concurrent request slots |
| `SESSION_TTL_HOURS` | `720` | |
| `MAX_UPLOAD_BYTES` | 12 MB | |

## API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/login` | `{password, persistent}` → session cookie |
| `POST` | `/api/logout` | destroy session |
| `GET` | `/api/me` | session + model info |
| `GET` | `/api/health` | liveness, engine state |
| `GET/POST` | `/api/conversations` | list / create |
| `GET/PATCH/DELETE` | `/api/conversations/:id` | read / rename / delete |
| `POST` | `/api/chat` | SSE stream (`start`, `delta`, `reasoning`, `error`, `done`) |
| `GET/POST` | `/api/projects` | list / create |
| `GET/PATCH/DELETE` | `/api/projects/:id` | |
| `POST/DELETE` | `/api/projects/:id/docs[/:docId]` | project knowledge |
| `GET` | `/api/engine/logs` | last 120 lines of the llama-server log |
| `POST` | `/api/engine/restart` | restart the engine |

## Architecture

```
server.js          HTTP + auth + SSE bridge            (no dependencies)
engine-client.js   supervises llama-server, streams tokens
config.js          every knob, env-overridable
auth.js            sessions, cookies, brute-force guard
store.js           atomic JSON persistence
prompts.js         the system prompts (conversation first, code only on request)
chat-template.js   LFM3 prompt template handed to llama-server --jinja
public/            the whole client (index.html, app.js, styles.css)
scripts/           fetch + build the engine, download the weights
tests/e2e.mjs      end-to-end suite
```

## Tests

```bash
node tests/e2e.mjs          # against a running server on :3000
BASE=http://127.0.0.1:3000 node tests/e2e.mjs
```

The suite covers the password gate, the API surface, streaming, projects, and the static app.

## License

MIT for this application. LFM3-1.7B weights are © Liquid AI under the LFM Open License v1.0.
