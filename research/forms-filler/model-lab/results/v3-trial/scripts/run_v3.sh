#!/usr/bin/env bash
# v3 dev baselines, one model at a time. schemareq == production schema (required keys); free == no constraint.
set -u
cd "$(dirname "$0")/.."
B=${B:-gguf/llama-b12182}
D=${D:-../../data/v3}
SPLIT=${SPLIT:-dev}
run(){ tag=$1; f=$2; q=${3:-}
  $B/llama-server -m gguf/$f -t 4 -c 1024 --port 8091 --no-webui -np 1 > runs/server_v3_$tag.log 2>&1 & P=$!
  for i in $(seq 60); do curl -s localhost:8091/health | grep -q ok && break; sleep 2; done
  mkdir -p runs
  for m in ${MODES:-schemareq free}; do python3 scripts/v2eval.py --data $D --prefix v3 --tag $tag --mode $m --split $SPLIT $q; done
  echo "$tag v3 $(grep VmHWM /proc/$P/status)" >> runs/llama_rss.txt; kill $P; wait $P 2>/dev/null; }
for spec in ${MODELS:-"qwen25-0.5b-q4km:qwen2.5-0.5b-instruct-q4_k_m.gguf:" "qwen3-0.6b-q8:Qwen3-0.6B-Q8_0.gguf:--qwen3" "qwen25-1.5b-q4km:qwen2.5-1.5b-instruct-q4_k_m.gguf:"}; do IFS=: read t f q <<< "$spec"; run $t $f $q; done
