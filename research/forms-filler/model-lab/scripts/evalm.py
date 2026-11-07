import json,sys,time,torch,resource,argparse
from pathlib import Path
from transformers import AutoModelForCausalLM,AutoTokenizer
from common import *
ROOT=Path(__file__).resolve().parents[1]
ap=argparse.ArgumentParser();ap.add_argument("--model");ap.add_argument("--split");ap.add_argument("--out");ap.add_argument("--adapter");ap.add_argument("--threads",type=int,default=3);ap.add_argument("--limit",type=int,default=0)
a=ap.parse_args();torch.set_num_threads(a.threads)
tok=AutoTokenizer.from_pretrained(a.model);m=AutoModelForCausalLM.from_pretrained(a.model,dtype=torch.bfloat16)
if a.adapter:
    from peft import PeftModel;m=PeftModel.from_pretrained(m,a.adapter);m=m.merge_and_unload()
m.eval();rows=[json.loads(l) for l in open(ROOT/f"data/v1/{a.split}.jsonl")]
if a.limit:rows=rows[:a.limit]
res=[];t0=time.time()
with open(a.out+".jsonl","w") as f:
  for e in rows:
    msgs=[{"role":"system","content":SYSTEM},{"role":"user","content":user_msg(e)}]
    kw={"enable_thinking":False} if "Qwen3" in a.model else {}
    ids=tok.apply_chat_template(msgs,add_generation_prompt=True,return_tensors="pt",return_dict=True,**kw)
    t=time.time()
    with torch.no_grad():o=m.generate(**ids,max_new_tokens=420,do_sample=False)
    txt=tok.decode(o[0][ids["input_ids"].shape[1]:],skip_special_tokens=True)
    r=dict(id=e["id"],raw=txt,pred=parse(txt),gold=e["gold"],sec=round(time.time()-t,2));res.append(r);f.write(json.dumps(r,ensure_ascii=False)+"\n");f.flush()
s=score(res);s.update(model=a.model,adapter=a.adapter,split=a.split,n_forms=len(res),total_sec=round(time.time()-t0),sec_per_form=round((time.time()-t0)/len(res),1),peak_rss_MB=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss//1024,threads=a.threads,dtype="bf16 CPU (NOT WebGPU/q4)")
json.dump(s,open(a.out+".metrics.json","w"),indent=1);print(json.dumps(s))
