#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Build llama.cpp (CPU build) and install llama-server into ./llama.cpp/build/bin
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

if [ ! -d "$ROOT/llama.cpp/.git" ]; then
  echo "==> cloning llama.cpp"
  git clone --depth 1 https://github.com/ggml-org/llama.cpp "$ROOT/llama.cpp"
fi

echo "==> configuring"
cmake -S "$ROOT/llama.cpp" -B "$ROOT/llama.cpp/build" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DLLAMA_CURL=OFF \
  -DGGML_NATIVE=ON \
  -DLLAMA_BUILD_TESTS=OFF \
  -DLLAMA_BUILD_SERVER=ON

echo "==> building llama-server (this takes a while on CPU-only machines)"
cmake --build "$ROOT/llama.cpp/build" --target llama-server -j "$(nproc)"

echo "==> done: $ROOT/llama.cpp/build/bin/llama-server"
