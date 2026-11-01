#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Build llama-server with LFM3 support.
#
# LFM3 (`general.architecture = lfm3`) was added upstream in llama.cpp b11938 /
# v0.8.0 — 27 Oct 2026. Older builds (including the v0.7.0 line shipped by
# node-llama-cpp today) refuse to load the weights with
#     "unsupported model architecture: lfm3"
# so this script fetches v0.8.0 from scratch and compiles only llama-server.
#
# Requirements: a C++ compiler and CMake ≥ 3.20.
#   * If CMake is missing, the script installs it from PyPI into ./.tools
#     (works even where apt is unavailable).
#
# Usage:  bash scripts/build-engine.sh
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
VERSION="${LLAMA_VERSION:-0.8.0}"
SRC="$ROOT/.build/llama.cpp-$VERSION"
OUT="$ROOT/llama.cpp/build/bin"
JOBS="${JOBS:-$(nproc 2>/dev/null || echo 2)}"

mkdir -p "$ROOT/.build" "$OUT"

# ---------------------------------------------------------------- toolchain --
if ! command -v g++ >/dev/null && ! command -v clang++ >/dev/null; then
  echo "!! no C++ compiler found. Install one first:" >&2
  echo "   Debian/Ubuntu: apt-get install -y build-essential" >&2
  exit 1
fi

CMAKE="$(command -v cmake || true)"
if [ -z "$CMAKE" ] || [ "$("$CMAKE" --version | head -1 | grep -o '[0-9]*\.[0-9]*' | head -1 | cut -d. -f1)" -lt 3 ]; then
  if [ ! -x "$ROOT/.tools/cmake/bin/cmake" ]; then
    echo "==> cmake not found — installing it from PyPI into .tools/"
    python3 -m pip download cmake --no-deps -d "$ROOT/.build/cmake-wheel" -q
    WHEEL="$(ls "$ROOT"/.build/cmake-wheel/cmake-*manylinux*x86_64*.whl 2>/dev/null | head -1)"
    if [ -z "$WHEEL" ]; then
      echo "!! could not fetch a cmake wheel; please install cmake ≥ 3.20" >&2
      exit 1
    fi
    mkdir -p "$ROOT/.tools/cmake"
    python3 -c "import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$WHEEL" "$ROOT/.tools/cmake"
    chmod +x "$ROOT/.tools/cmake/data/bin/"*
  fi
  CMAKE="$ROOT/.tools/cmake/data/bin/cmake"
fi

echo "==> cmake:   $($CMAKE --version | head -1)"

# ------------------------------------------------------------------- source --
if [ ! -f "$SRC/CMakeLists.txt" ]; then
  echo "==> fetching llama.cpp v$VERSION"
  TARBALL="${ENGINE_TARBALL_URL:-https://codeload.github.com/ggml-org/llama.cpp/tar.gz/refs/tags/v$VERSION}"
  mkdir -p "$ROOT/.build/src"
  if ! curl -fL --retry 3 --max-time 600 -o "$ROOT/.build/llama.tar.gz" "$TARBALL"; then
    echo "!! could not download llama.cpp source." >&2
    echo "   Set ENGINE_TARBALL_URL to a reachable tarball of llama.cpp v0.8.0+" >&2
    exit 1
  fi
  tar -xzf "$ROOT/.build/llama.tar.gz" -C "$ROOT/.build/src"
  inner="$(find "$ROOT/.build/src" -maxdepth 2 -name CMakeLists.txt -printf '%h\n' | head -1)"
  mv "$inner" "$SRC"
fi

if ! grep -q "lfm3" "$SRC/src/llama-arch.cpp"; then
  echo "!! this llama.cpp source has no LFM3 support (needs v0.8.0+)" >&2
  exit 1
fi
echo "==> source has LFM3 support ✓"

# -------------------------------------------------------------------- build --
echo "==> configuring (CPU, offline, $JOBS jobs)"
"$CMAKE" -S "$SRC" -B "$SRC/build" \
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
  -DCMAKE_RUNTIME_OUTPUT_DIRECTORY="$OUT" \
  -DCMAKE_LIBRARY_OUTPUT_DIRECTORY="$OUT" >/dev/null

echo "==> compiling llama-server (this takes a few minutes on CPU)"
"$CMAKE" --build "$SRC/build" --target llama-server -j"$JOBS"

if [ ! -x "$OUT/llama-server" ]; then
  echo "!! build finished but $OUT/llama-server is missing" >&2
  exit 1
fi

echo ""
echo "==> done: $OUT/llama-server"
"$OUT/llama-server" --version 2>&1 | head -2 || true
