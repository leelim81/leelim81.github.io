#!/usr/bin/env bash
# One model at a time, ctx 1024 like the browser engine.
set -u; B=gguf/llama-b12182
run(){ tag=$1; f=$2; q=${3:-}
  $B/llama-server -m gguf/$f -t 4 -c 1024 --port 8091 --no-webui -np 1 > runs/server_v2_$tag.log 2>&1 & P=$!
  for i in $(seq 60); do curl -s localhost:8091/health | grep -q ok && break; sleep 2; done
  for m in schema free; do python3 v2eval.py --tag $tag --mode $m --split dev $q; done
  [ "$tag" = qwen25-1.5b-q4km ] && for m in schema free; do python3 llamaeval.py --tag $tag --set prod --mode $m | tail -1; done
  echo "$tag v2 $(grep VmHWM /proc/$P/status)" | tee -a runs/llama_rss.txt; kill $P; wait $P 2>/dev/null; }
run qwen25-0.5b-q4km qwen2.5-0.5b-instruct-q4_k_m.gguf
run qwen3-0.6b-q8 Qwen3-0.6B-Q8_0.gguf --qwen3
run qwen25-1.5b-q4km qwen2.5-1.5b-instruct-q4_k_m.gguf
