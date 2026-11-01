#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Install the llama.cpp source tree into ./engine
#
#  1. ./engine already present            → done
#  2. $ENGINE_TARBALL_URL set             → download + extract that tarball
#  3. otherwise                           → `npm pack node-llama-cpp`, which ships
#     the pinned llama.cpp release as a git bundle (works anywhere that can
#     reach the npm registry, no GitHub egress needed)
#
# The tree is trimmed to what the build needs (~55 MB instead of ~215 MB).
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="$(pwd)/engine"

if [ -f "$SRC/tools/server/main.cpp" ]; then
  echo "==> engine source already present"
  exit 0
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [ -n "${ENGINE_TARBALL_URL:-}" ]; then
  echo "==> downloading llama.cpp source tarball"
  curl -fsSL "$ENGINE_TARBALL_URL" -o "$WORK/engine.tar.gz"
  mkdir -p "$WORK/src"
  tar -xzf "$WORK/engine.tar.gz" -C "$WORK/src"
  # allow an archive that nests everything in one top-level folder
  if [ ! -f "$WORK/src/tools/server/main.cpp" ]; then
    inner="$(find "$WORK/src" -maxdepth 2 -name CMakeLists.txt -printf '%h\n' 2>/dev/null | head -1)"
    if [ -n "$inner" ] && [ -f "$inner/tools/server/main.cpp" ]; then mv "$inner" "$WORK/src2" && rm -rf "$WORK/src" && mv "$WORK/src2" "$WORK/src"; fi
  fi
else
  echo "==> fetching the pinned llama.cpp snapshot via node-llama-cpp"
  (cd "$WORK" && npm pack node-llama-cpp --silent >/dev/null)
  tar -xzf "$WORK"/node-llama-cpp-*.tgz -C "$WORK" package/llama/gitRelease.bundle
  bundle="$WORK/package/llama/gitRelease.bundle"
  [ -f "$bundle" ] || { echo "!! node-llama-cpp no longer ships a llama.cpp bundle; set ENGINE_TARBALL_URL" >&2; exit 1; }
  mkdir -p "$WORK/src"
  git -C "$WORK/src" init -q
  git -C "$WORK/src" fetch -q "$bundle" HEAD
  git -C "$WORK/src" checkout -q FETCH_HEAD
fi

if [ ! -f "$WORK/src/tools/server/main.cpp" ]; then
  echo "!! could not locate the llama.cpp source" >&2
  exit 1
fi

# Keep only what the build needs
rm -rf "$WORK/src/models" "$WORK/src/docs" "$WORK/src/tests" "$WORK/src/benches" \
       "$WORK/src/examples" "$WORK/src/app" "$WORK/src/conversion" "$WORK/src/gguf-py" \
       "$WORK/src/ci" "$WORK/src/unittests" "$WORK/src/.git" "$WORK/src/.github"

mv "$WORK/src" "$SRC"
echo "==> engine source installed at engine/ ($(du -sh "$SRC" | cut -f1))"
