# ---------------------------------------------------------------------------
# Kosmos Code — Node.js + llama.cpp + the real Qwen3-0.6B GGUF weights
#
# Fully self-contained: llama.cpp source is vendored in ./engine and the model
# is pulled from a public GitHub mirror with a SHA-256 check, so the build needs
# no Hugging Face / GitHub-release egress beyond github.com.
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim AS engine-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
      cmake build-essential ca-certificates ninja-build \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY engine ./engine
RUN cmake -S engine -B engine/build -G Ninja \
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
    && cmake --build engine/build --target llama-server -j"$(nproc)"

# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=engine-builder /opt/llama/bin /app/llama.cpp/build/bin

COPY package.json server.js ./
COPY public ./public
COPY scripts ./scripts

# Real Qwen3-0.6B weights (484 MB) + SHA-256 verification
RUN bash scripts/download-model.sh && rm -rf /tmp/model-parts

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    MODEL_PATH=/app/models/Qwen3-0.6B-Q4_K_M.gguf \
    LLAMA_SERVER_BIN=/app/llama.cpp/build/bin/llama-server \
    CTX_SIZE=4096

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
