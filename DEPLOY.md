# Deploying Kosmos AI

The app is one Node process plus one `llama-server` child. There is no database
and no external API, so any box with a C++ toolchain can host it.

## The one hard requirement

The weights live on Hugging Face. **The host that first runs
`scripts/download-model.sh` needs access to `huggingface.co`** (or `hf-mirror.com`
as a fallback). After that first download the app is fully offline.

If the host is blocked, download on your laptop and copy the file over:

```bash
# on a machine with access
hf download LiquidAI/LFM3-1.7B-GGUF LFM3-1.7B-Q4_K_M.gguf --local-dir models/
# then
scp models/LFM3-1.7B-Q4_K_M.gguf user@server:/app/models/
```

## Get a public URL in one step

`docker-compose.yml` and `render.yaml` in the repo root are ready to use.

```bash
cp .env.example .env      # then edit APP_PASSWORD
docker compose up -d --build
```

That gives you `http://<host>:3000`. Put it behind any TLS proxy (Caddy is the
shortest route) and you have a real `https://` address:

```
kosmos.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

**Render / Railway / Fly** — all three run the Dockerfile directly:

- Render: push to GitHub → New → Blueprint → pick this repo. `render.yaml`
  already declares the health check, the plan and `APP_PASSWORD` (prompted, never
  committed). Pick the **2 GB** plan; the weights are 1.1 GB before the KV cache.
- Fly: `fly launch --no-deploy` then `fly secrets set APP_PASSWORD=...` and
  `fly deploy`. Give the machine 2 GB: `fly scale memory 2048`.

The app reads `x-forwarded-proto` to mark the session cookie `Secure` and
switches to `SameSite=None` when it is framed, so login keeps working behind a
TLS-terminating proxy and inside an embedded preview. No extra flags needed.

## Docker (recommended)

```bash
docker build -t kosmos-ai .
docker run -d --name kosmos \
  -p 3000:3000 \
  -e APP_PASSWORD='Kosmos@2026' \
  -e CTX_SIZE=8192 \
  -e ENGINE_THREADS=4 \
  --restart unless-stopped \
  kosmos-ai
```

The image compiles llama.cpp v0.8.0 (LFM3 support) and bakes the Q4_K_M weights
into their own layer. Expect ~25 min on first build for a 2-core box, and about
1.4 GB of RAM at runtime (1.1 GB weights + KV cache).

### GPU

Build llama-server with CUDA and pass `ENGINE_GPU_LAYERS=99`:

```bash
docker build --build-arg LLAMA_VERSION=0.8.0 -t kosmos-cuda .
docker run --gpus all -p 3000:3000 -e APP_PASSWORD='Kosmos@2026' \
  -e ENGINE_GPU_LAYERS=99 -e CTX_SIZE=32768 kosmos-cuda
```

On a GPU, 32K context is comfortable; the native 256K needs ~1.6 GB of KV cache
on its own, so only raise `CTX_SIZE` if the box has the memory.

## Bare metal

```bash
sudo apt-get install -y build-essential cmake curl nodejs npm
git clone <this repo> && cd kosmos-GPT2

bash scripts/build-engine.sh      # ~10 min on 2 cores
bash scripts/download-model.sh    # ~1.1 GB
APP_PASSWORD='Kosmos@2026' npm start
```

## Behind a reverse proxy (nginx / Caddy)

Streaming needs compression and buffering turned off for `/api/chat`:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;          # keeps SSE streaming smooth
    proxy_read_timeout 600s;
}
```

Caddy needs no extra configuration for streaming.

**Serve it over HTTPS.** The session cookie is `HttpOnly` + `SameSite=Lax`; over
plain HTTP it still works, but the password would travel in clear text.

## Sizing

| Box | Context | Throughput |
|---|---|---|
| 2 vCPU / 4 GB | 8K | ~6–9 tok/s |
| 4 vCPU / 8 GB | 16–32K | ~15–20 tok/s |
| 1 GPU (8 GB+) | 32K+ | 100+ tok/s |

Generation speed scales roughly linearly with cores for a 1.7B Q4 model.

## Health and operations

```bash
curl -s localhost:3000/api/health          # liveness + engine state
curl -s localhost:3000/api/engine/logs -b <cookie>   # last 120 engine lines
curl -X POST localhost:3000/api/engine/restart -b <cookie>
```

`/api/health` returns `200` as long as the server is up; look at
`model.state` (`ready` / `starting` / `error`) for the engine. The Docker
`HEALTHCHECK` uses the same endpoint.

Kill the process with `SIGTERM`/`SIGINT` and it stops `llama-server` cleanly.

## Notes

- **Sessions** live in `data/sessions.json` (opaque tokens, sliding expiry).
  Deleting that file signs everyone out.
- **Chats** live in `data/conversations.json`; everything is per-session, so a
  second person logging in with the shared password sees an empty sidebar.
- **Backups**: copy `data/`. It is the entire state of the app.
