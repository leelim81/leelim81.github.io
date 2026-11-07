import json,re
SYSTEM=("You fill Singapore form fields from reference documents. Output ONLY one JSON object whose keys are exactly the given labels. "
"Use a value only if the documents clearly support it for the APPLICANT (or emergency contact for emergency fields); otherwise null. Never guess. "
"Dates DD/MM/YYYY. Phone: 8 digits only. Unit like #05-123. Names in UPPER CASE. For checkbox labels give the single chosen option text. "
"Citizenship only if explicitly stated or a FIN/foreign pass is shown.")
def user_msg(e):
    d="\n\n".join(f"[Document {i+1}]\n{x}" for i,x in enumerate(e["docs"]))
    return f"{d}\n\nLabels: {json.dumps(e['labels'],ensure_ascii=False)}\nJSON:"
def target(e):return json.dumps(e["gold"],ensure_ascii=False)
def norm(v):
    if v is None:return None
    s=str(v).strip().upper()
    if s in("","NULL","NONE","N/A","-"):return None
    m=re.fullmatch(r"(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{4})",s)
    if m:return f"{int(m[1]):02d}/{int(m[2]):02d}/{m[3]}"
    d=re.sub(r"\D","",s)
    if re.fullmatch(r"[+()\d \-]+",s) and len(d)>=8:return d[-8:]
    s=s.lstrip("#").replace("SINGAPORE CITIZEN","SC").replace("PERMANENT RESIDENT","PR")
    return re.sub(r"\s+"," ",s)
def parse(txt):
    m=re.search(r"\{.*\}",txt,re.S)
    if not m:return None
    try:return json.loads(m.group(0))
    except Exception:return None
def score(rows):
    c=dict(tp=0,wrong=0,fp_on_null=0,fn=0,tn=0,parse_fail=0,n=0)
    for r in rows:
        p=r["pred"];g=r["gold"]
        if p is None:c["parse_fail"]+=1;p={}
        for L,gv in g.items():
            c["n"]+=1;gv=norm(gv);pv=norm(p.get(L)) if isinstance(p,dict) else None
            if gv is None:
                if pv is None:c["tn"]+=1
                else:c["fp_on_null"]+=1
            else:
                if pv is None:c["fn"]+=1
                elif pv==gv:c["tp"]+=1
                else:c["wrong"]+=1
    filled=c["tp"]+c["wrong"]+c["fp_on_null"];nn=c["tp"]+c["wrong"]+c["fn"];nul=c["tn"]+c["fp_on_null"]
    c.update(precision=round(c["tp"]/max(filled,1),3),recall=round(c["tp"]/max(nn,1),3),
      wrong_fill_rate=round((c["wrong"]+c["fp_on_null"])/max(filled,1),3),abstain_acc=round(c["tn"]/max(nul,1),3),
      field_acc=round((c["tp"]+c["tn"])/c["n"],3),form_exact=round(sum(all(norm((r["pred"] or {}).get(L))==norm(v) for L,v in r["gold"].items()) for r in rows)/len(rows),3))
    return c
