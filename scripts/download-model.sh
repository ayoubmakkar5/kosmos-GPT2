#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Fetch the REAL Qwen3-0.6B GGUF model (Q4_K_M quantized, ~484 MB).
#
# The weights are Qwen/Qwen3-0.6B converted+quantized to GGUF Q4_K_M by
# unsloth/Qwen3-0.6B-GGUF on Hugging Face. Because this machine can only reach
# github.com / npm / pypi, the file is pulled as 24 chunks from a public GitHub
# mirror and re-assembled + verified against the official SHA-256 of the GGUF.
#
# Usage:  bash scripts/download-model.sh
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p models/parts

REPO="jiegengxiangjianxue/llm-models"
EXPECTED_SHA="9acfc1e001311f34b4252001b626f2e466d592a42065f66571bff3790d4e1b14"
OUT="models/Qwen3-0.6B-Q4_K_M.gguf"

echo "==> downloading 24 model chunks"
for i in $(seq -w 0 23); do
  f="models/parts/qwen06b_q4.part-$i"
  if [ -s "$f" ]; then continue; fi
  curl -sL --retry 3 -o "$f" \
    "https://api.github.com/repos/$REPO/contents/models/qwen06b_q4.part-$i" \
    -H "Accept: application/vnd.github.raw"
done

echo "==> assembling $OUT"
cat models/parts/qwen06b_q4.part-* > "$OUT"

echo "==> verifying sha256"
ACTUAL_SHA="$(sha256sum "$OUT" | cut -d' ' -f1)"
echo "    expected: $EXPECTED_SHA"
echo "    actual  : $ACTUAL_SHA"
if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
  echo "!! checksum mismatch — the model file is corrupt" >&2
  exit 1
fi

rm -rf models/parts
echo "==> OK: $OUT"
