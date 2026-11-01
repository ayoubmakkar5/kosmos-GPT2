#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Fetch the LFM3-1.7B GGUF weights from Hugging Face (Liquid AI).
#
# This is the ONLY step that needs internet access to huggingface.co. Everything
# else (engine build, model load, serving) works offline afterwards.
#
# Usage:
#   bash scripts/download-model.sh                 # Q4_K_M (~1.1 GB, recommended)
#   QUANT=Q8_0 bash scripts/download-model.sh      # Q8_0   (~1.85 GB)
#   QUANT=Q4_0 bash scripts/download-model.sh      # Q4_0   (~1.06 GB, smallest sane)
#
# Quant guide (file sizes from the official repo):
#   Q4_K_M 1.12 GB · best size/quality trade-off
#   Q5_K_M 1.26 GB · noticeably better Arabic
#   Q8_0   1.85 GB · reference quality
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="${HF_REPO:-LiquidAI/LFM3-1.7B-GGUF}"
QUANT="${QUANT:-Q4_K_M}"
FILE="${HF_FILE:-LFM3-1.7B-${QUANT}.gguf}"
OUT="models/${FILE}"
URL="${HF_URL:-https://huggingface.co/${REPO}/resolve/main/${FILE}?download=true}"
MIRROR="${HF_MIRROR:-https://hf-mirror.com/${REPO}/resolve/main/${FILE}?download=true}"

mkdir -p models

if [ -s "$OUT" ] && [ "$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")" -gt 100000000 ]; then
  echo "==> model already present: $OUT ($(du -h "$OUT" | cut -f1))"
  exit 0
fi

download() {
  local url="$1" label="$2"
  echo "==> downloading $label"
  echo "    $url"
  if command -v curl >/dev/null; then
    curl -fL --retry 3 --retry-delay 2 -C - --progress-bar -o "$OUT.part" "$url"
  else
    wget -c -O "$OUT.part" "$url"
  fi
}

# 1) huggingface.co, 2) hf-mirror.com, 3) hf CLI if installed
if ! download "$URL" "Hugging Face"; then
  rm -f "$OUT.part"
  echo "!! huggingface.co unreachable, trying the hf-mirror mirror"
  if ! download "$MIRROR" "hf-mirror.com"; then
    rm -f "$OUT.part"
    if command -v hf >/dev/null; then
      echo "==> falling back to the hf CLI"
      hf download "$REPO" "$FILE" --local-dir models
    else
      echo "" >&2
      echo "!! Could not download the weights." >&2
      echo "   Download the file manually on a machine with access:" >&2
      echo "     https://huggingface.co/${REPO}/blob/main/${FILE}" >&2
      echo "   then place it at: $(pwd)/$OUT" >&2
      exit 1
    fi
  fi
fi

[ -f "$OUT.part" ] && mv "$OUT.part" "$OUT"

echo "==> downloaded $OUT ($(du -h "$OUT" | cut -f1))"

# Optional integrity check: set MODEL_SHA256 to the checksum Liquids publishes
if [ -n "${MODEL_SHA256:-}" ]; then
  echo "==> verifying sha256"
  ACTUAL="$(sha256sum "$OUT" | cut -d' ' -f1)"
  if [ "$ACTUAL" != "${MODEL_SHA256,,}" ]; then
    echo "!! checksum mismatch" >&2
    echo "   expected: $MODEL_SHA256" >&2
    echo "   actual:   $ACTUAL" >&2
    exit 1
  fi
  echo "==> checksum OK"
fi

echo ""
echo "Next: npm start   (the server starts llama-server with this model)"
