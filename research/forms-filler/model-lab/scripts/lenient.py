"""POST-HOC DIAGNOSTIC ONLY (not used for any decision): recover "key": value pairs from malformed JSON; keys with no value -> null."""
import json,re,sys
from common import score
def lp(t):
    return {m[0]:(None if m[1]=='null' else json.loads(m[1])) for m in re.findall(r'"([^"]+)"\s*:\s*(null|"(?:[^"\\]|\\.)*")',t)}
for f in sys.argv[1:]:
    r=[json.loads(l) for l in open(f)]
    for x in r:
        if x["pred"] is None:x["pred"]=lp(x["raw"])
    s=score(r);print(f,{k:s[k] for k in("tp","wrong","fp_on_null","fn","tn","precision","recall","wrong_fill_rate","abstain_acc")})
