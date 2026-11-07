#!/usr/bin/env bash
# Regenerate v1 in a temp dir and verify byte-identity with data/v1 (gen.py writes ./data/).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; T="$(mktemp -d)"; mkdir -p "$T/data"
( cd "$T" && python3 "$ROOT/scripts/gen.py" >/dev/null )
for s in train dev test; do cmp "$T/data/$s.jsonl" "$ROOT/data/v1/$s.jsonl" && echo "$s identical"; done
