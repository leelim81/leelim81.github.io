#!/usr/bin/env bash
# usage: postfilter_score.sh gold.jsonl preds.jsonl
# Prints RAW and POSTFILTER scores. Writes preds.pfrows.jsonl, preds.pfout.jsonl, preds.postfilter.jsonl next to the predictions.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
G=$1; P=$2; O=${P%.jsonl}; PF=${PF:-$ROOT/postfilter}
cd "$ROOT"
python3 - "$G" "$P" > $O.pfrows.jsonl <<'E'
import json,sys
g={json.loads(l)["id"]:json.loads(l) for l in open(sys.argv[1])}
for l in open(sys.argv[2]):
    r=json.loads(l);e=g[r["id"]]
    print(json.dumps({"id":r["id"],"context":e["excerpt"],"fields":e["model_fields"],"seeded":e.get("parser_filled",{}),"response":r["raw"]}))
E
node $PF/postfilter.mjs $O.pfrows.jsonl -o $O.pfout.jsonl
python3 -c "
import json,sys
for l in open('$O.pfout.jsonl'):
    r=json.loads(l);print(json.dumps({'id':r['id'],'pred':r['values'],'sources':r['sources']}))" > $O.postfilter.jsonl
echo "RAW        $(python3 "$ROOT/scripts/score3.py" $G $P)"; echo "POSTFILTER $(python3 "$ROOT/scripts/score3.py" $G $O.postfilter.jsonl)"
