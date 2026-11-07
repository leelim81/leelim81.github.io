"""v3 scorer = score_v2 semantics (no JSON repair) with extra breakdown: wrong-person date (gold empty on patient-is-not-applicant date field)."""
import json,sys,re
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "v2" / "v2-bundle" / "scripts"))
from score_v2 import norm
gold={json.loads(l)["id"]:json.loads(l) for l in open(sys.argv[1])}
c=dict(forms=0,parse_fail=0,matched=0,wrong_value=0,spurious_unsupported=0,spurious_wrong_person_dob=0,missed=0,correct_empty=0)
for l in open(sys.argv[2]):
    r=json.loads(l);g=gold[r["id"]];c["forms"]+=1;p=r.get("pred")
    if not isinstance(p,dict):c["parse_fail"]+=1;p={}
    for f in g["model_fields"]:
        k=f["id"];w=norm(g["gold"][k]);v=norm(p.get(k))
        if w is None and v is None:c["correct_empty"]+=1
        elif w is None:
            c["spurious_wrong_person_dob" if (g.get("pair")=="patient-is-not-applicant" and re.search(r"birth|dob",f["label"],re.I)) else "spurious_unsupported"]+=1
        elif v is None:c["missed"]+=1
        elif v==w:c["matched"]+=1
        else:c["wrong_value"]+=1
fill=c["matched"]+c["wrong_value"]+c["spurious_unsupported"]+c["spurious_wrong_person_dob"];sup=c["matched"]+c["wrong_value"]+c["missed"]
c["wrong_fill_rate"]=round((fill-c["matched"])/fill,3) if fill else None;c["recall"]=round(c["matched"]/sup,3) if sup else None
print(json.dumps(c))
