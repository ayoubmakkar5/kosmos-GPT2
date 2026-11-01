# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# Kosmos AI — Node 22 + llama.cpp (LFM3-enabled) + Liquid AI LFM3-1.7B
#
# Stage 1 builds llama-server from llama.cpp v0.8.0, the first release that
# understands the `lfm3` architecture.
# Stage 2 downloads the GGUF weights and runs the app.
#
#   docker build -t kosmos-ai .
#   docker run -p 3000:3000 -e APP_PASSWORD='Kosmos@2026' kosmos-ai
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim AS engine

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git build-essential cmake python3 \
    && rm -rf /var/lib/apt/lists/*

ARG LLAMA_VERSION=0.8.0
WORKDIR /src
RUN curl -fL --retry 3 -o llama.tar.gz \
      "https://codeload.github.com/ggml-org/llama.cpp/tar.gz/refs/tags/v${LLAMA_VERSION}" \
 && mkdir -p llama && tar -xzf llama.tar.gz -C llama --strip-components=1 \
 && grep -q lfm3 llama/src/llama-arch.cpp

RUN cmake -S llama -B llama/build \
      -DCMAKE_BUILD_TYPE=Release \
      -DLLAMA_CURL=OFF \
      -DGGML_NATIVE=OFF \
      -DGGML_OPENMP=ON \
      -DLLAMA_BUILD_TESTS=OFF \
      -DLLAMA_BUILD_EXAMPLES=OFF \
      -DLLAMA_BUILD_APP=OFF \
      -DLLAMA_BUILD_SERVER=ON \
      -DLLAMA_USE_PREBUILT_UI=OFF \
      -DMTMD_VIDEO=OFF \
      -DCMAKE_RUNTIME_OUTPUT_DIRECTORY=/opt/llama/bin \
      -DCMAKE_LIBRARY_OUTPUT_DIRECTORY=/opt/llama/bin \
 && cmake --build llama/build --target llama-server -j"$(nproc)" \
 && test -x /opt/llama/bin/llama-server

# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=engine /opt/llama/bin /app/llama.cpp/build/bin
COPY package.json server.js config.js engine-client.js auth.js store.js \
     prompts.js chat-template.js ./
COPY public ./public
COPY scripts ./scripts

# LFM3-1.7B weights (~1.1 GB at Q4_K_M). Cached as its own layer so a code
# change does not re-download it.
ARG QUANT=Q4_K_M
RUN bash scripts/download-model.sh

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    MODEL_FILE=models/LFM3-1.7B-Q4_K_M.gguf \
    CTX_SIZE=8192 \
    LLAMA_SERVER_BIN=/app/llama.cpp/build/bin/llama-server \
    ENGINE_THREADS=4

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=180s \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
