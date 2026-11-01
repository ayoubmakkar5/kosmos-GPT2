# ---------------------------------------------------------------------------
# Kosmos Code — full image: Node.js + llama.cpp + real Qwen3-0.6B GGUF weights
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim AS llama-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
      git cmake build-essential curl ca-certificates ninja-build \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git clone --depth 1 https://github.com/ggml-org/llama.cpp.git
RUN cmake -S llama.cpp -B llama.cpp/build -G Ninja \
      -DCMAKE_BUILD_TYPE=Release -DLLAMA_CURL=OFF -DLLAMA_BUILD_TESTS=OFF \
    && cmake --build llama.cpp/build --target llama-server -j"$(nproc)"

# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# llama.cpp runtime (binaries + shared libs)
COPY --from=llama-builder /src/llama.cpp/build/bin /app/llama.cpp/build/bin

# App code
COPY package.json server.js ./
COPY public ./public
COPY scripts ./scripts

# Real model weights (484 MB, verified by the download script)
RUN bash scripts/download-model.sh

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    MODEL_PATH=/app/models/Qwen3-0.6B-Q4_K_M.gguf \
    LLAMA_SERVER_BIN=/app/llama.cpp/build/bin/llama-server \
    CTX_SIZE=4096

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
