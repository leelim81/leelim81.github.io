"""Evaluate on the cloud production-aligned bundle records using their production_prompt verbatim (single user turn).
Difference vs browser: no WebLLM JSON-schema constrained decoding; bf16 CPU HF weights; greedy."""
import json,sys,time,torch,resource,argparse
from pathlib import Path
from transformers import AutoModelForCausalLM,AutoTokenizer
from common import norm,parse
ROOT=Path(__file__).resolve().parents[1]
# Default is the 22-record smoke suite (train 12 + dev 4 + test 6), not data/v1.
ap=argparse.ArgumentParser();ap.add_argument("--model");ap.add_argument("--adapter");ap.add_argument("--out");ap.add_argument("--threads",type=int,default=3);ap.add_argument("--data",default=str(ROOT.parent/"data"))
a=ap.parse_args();torch.set_num_threads(a.threads)
tok=AutoTokenizer.from_pretrained(a.model);m=AutoModelForCausalLM.from_pretrained(a.model,dtype=torch.bfloat16)
if a.adapter:
    from peft import PeftModel;m=PeftModel.from_pretrained(m,a.adapter).merge_and_unload()
c=dict(tp=0,wrong=0,fp_on_null=0,fn=0,tn=0,parse_fail=0,n=0);out=open(a.out+".jsonl","w");t0=time.time();nrec=0
for sp in["train","dev","test"]:
  for l in open(f"{a.data}/{sp}.jsonl"):
    e=json.loads(l);nrec+=1
    kw={"enable_thinking":False} if "Qwen3" in a.model else {}
    ids=tok.apply_chat_template([{"role":"user","content":e["production_prompt"]}],add_generation_prompt=True,return_tensors="pt",return_dict=True,**kw)
    with torch.no_grad():o=m.generate(**ids,max_new_tokens=200,do_sample=False)
    txt=tok.decode(o[0][ids["input_ids"].shape[1]:],skip_special_tokens=True);p=parse(txt)
    if p is None:c["parse_fail"]+=1;p={}
    for f in e["model_fields"]:
      k=f["id"];g=norm(e["gold"].get(k));v=norm(p.get(k)) if isinstance(p,dict) else None;c["n"]+=1
      if g is None:c["tn" if v is None else "fp_on_null"]+=1
      elif v is None:c["fn"]+=1
      else:c["tp" if v==g else "wrong"]+=1
    out.write(json.dumps(dict(id=e["id"],split=sp,raw=txt,pred=p,gold={f["id"]:e["gold"].get(f["id"]) for f in e["model_fields"]}))+"\n")
c.update(records=nrec,model=a.model,adapter=a.adapter,sec=round(time.time()-t0),peak_rss_MB=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss//1024,note="model_fields only; parser handles the rest; bf16 CPU, no schema-constrained decoding")
json.dump(c,open(a.out+".metrics.json","w"),indent=1);print(json.dumps(c))
