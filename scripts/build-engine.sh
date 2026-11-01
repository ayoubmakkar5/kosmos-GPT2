#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Build the llama.cpp runtime that Kosmos Code uses to run the Qwen3 model.
#
# The source is vendored in ./engine (llama.cpp v0.7.0 snapshot) so the build is
# reproducible and needs no GitHub/network access. Output lands in
# ./llama.cpp/build/bin/llama-server (the default LLAMA_SERVER_BIN).
#
# Usage:  bash scripts/build-engine.sh
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
SRC="$ROOT/engine"
OUT="$ROOT/llama.cpp/build/bin"

if [ ! -f "$SRC/CMakeLists.txt" ]; then
  echo "==> llama.cpp source missing, fetching it"
  bash "$(dirname "$0")/fetch-engine.sh"
fi

command -v cmake >/dev/null || { echo "!! cmake is required" >&2; exit 1; }

echo "==> configuring llama.cpp (CPU only, offline)"
cmake -S "$SRC" -B "$ROOT/llama.cpp/build" \
  -DCMAKE_BUILD_TYPE=Release \
  -DLLAMA_CURL=OFF \
  -DGGML_NATIVE=OFF \
  -DGGML_OPENMP=ON \
  -DLLAMA_BUILD_TESTS=OFF \
  -DLLAMA_BUILD_EXAMPLES=OFF \
  -DLLAMA_BUILD_APP=OFF \
  -DLLAMA_BUILD_SERVER=ON \
  -DMTMD_VIDEO=OFF \
  -DLLAMA_USE_PREBUILT_UI=OFF \
  -DCMAKE_INSTALL_PREFIX="$OUT" \
  -DCMAKE_RUNTIME_OUTPUT_DIRECTORY="$OUT" \
  -DCMAKE_LIBRARY_OUTPUT_DIRECTORY="$OUT"

echo "==> compiling llama-server (a few minutes on CPU)"
cmake --build "$ROOT/llama.cpp/build" --target llama-server -j "$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 2)"

# Shared libs must sit next to the binary
find "$ROOT/llama.cpp/build" -name '*.so*' -exec cp -a {} "$OUT/" \; 2>/dev/null || true
find "$ROOT/llama.cpp/build" -name '*.dylib' -exec cp -a {} "$OUT/" \; 2>/dev/null || true

if [ ! -x "$OUT/llama-server" ]; then
  echo "!! build finished but $OUT/llama-server is missing" >&2
  exit 1
fi

echo "==> OK: $OUT/llama-server"
"$OUT/llama-server" --version 2>&1 | head -3 || true
