#!/usr/bin/env bash
# Runs after train3.py (PID in runs/train_v3.pid) and the base eval finish: merged HF -> f16 GGUF -> Q4_K_M (same pipeline as own base) -> dev eval (schemareq) -> RAW/POSTFILTER scores.
set -u
cd "$(dirname "$0")/.."
while kill -0 $(cat runs/train_v3.pid) 2>/dev/null || pgrep -f run_v3.sh >/dev/null; do sleep 15; done
. .venv/bin/activate
python gguf/llama.cpp-b12182/convert_hf_to_gguf.py adapters/v3_lora-merged --outtype f16 --outfile gguf/own/v3lora05-f16.gguf
gguf/llama-b12182/llama-quantize gguf/own/v3lora05-f16.gguf gguf/own/v3lora05-q4km.gguf Q4_K_M 2
sha256sum gguf/own/v3lora05-q4km.gguf > runs/v3lora05-q4km.sha256
MODES=schemareq MODELS="own-v3lora05-q4km:own/v3lora05-q4km.gguf:" bash scripts/run_v3.sh
for t in own-base05-q4km own-v3lora05-q4km; do echo "== $t"; bash scripts/postfilter_score.sh ../../data/v3/dev.jsonl runs/v3_${t}_dev_schemareq.jsonl; done > runs/v3_dev_own_compare.txt 2>&1
echo DONE >> runs/v3_dev_own_compare.txt
