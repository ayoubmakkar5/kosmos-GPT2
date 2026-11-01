#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Fetch the REAL Qwen3-0.6B GGUF model (Q4_K_M quantized, ~484 MB).
#
# The weights are Qwen/Qwen3-0.6B, converted + quantized to GGUF Q4_K_M by
# unsloth/Qwen3-0.6B-GGUF. Two sources are tried, in order:
#
#   1. Hugging Face  (single file, fastest when reachable)
#   2. A public GitHub mirror, split in 24 chunks — used where Hugging Face is
#      blocked (e.g. this sandbox).
#
# Both routes end with a SHA-256 check against the official GGUF checksum.
#
# Usage:  bash scripts/download-model.sh
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="jiegengxiangjianxue/llm-models"
EXPECTED_SHA="9acfc1e001311f34b4252001b626f2e466d592a42065f66571bff3790d4e1b14"
OUT="models/Qwen3-0.6B-Q4_K_M.gguf"
HF_URL="https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf?download=true"

mkdir -p models

verify() {
  echo "==> verifying sha256"
  local actual
  actual="$(sha256sum "$OUT" | cut -d' ' -f1)"
  echo "    expected: $EXPECTED_SHA"
  echo "    actual  : $actual"
  if [ "$actual" != "$EXPECTED_SHA" ]; then
    echo "!! checksum mismatch — the model file is corrupt" >&2
    return 1
  fi
  echo "==> OK: $OUT"
}

# Already downloaded and valid?
if [ -s "$OUT" ] && verify >/dev/null 2>&1; then
  echo "==> model already present: $OUT"
  exit 0
fi

echo "==> trying Hugging Face"
if curl -fsSL --retry 2 --max-time 600 -o "$OUT.tmp" "$HF_URL" 2>/dev/null; then
  mv "$OUT.tmp" "$OUT"
else
  rm -f "$OUT.tmp"
  echo "    Hugging Face not reachable, falling back to the GitHub mirror"
  mkdir -p models/parts
  for i in $(seq -w 0 23); do
    f="models/parts/qwen06b_q4.part-$i"
    [ -s "$f" ] && continue
    curl -sL --retry 3 -o "$f" \
      "https://api.github.com/repos/$REPO/contents/models/qwen06b_q4.part-$i" \
      -H "Accept: application/vnd.github.raw"
  done
  echo "==> assembling $OUT"
  cat models/parts/qwen06b_q4.part-* > "$OUT"
  rm -rf models/parts
fi

verify
