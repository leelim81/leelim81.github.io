"""Deterministic llama.cpp (llama-server) eval. temperature 0, seed 0, n_predict 256.
Modes: schema (OpenAI response_format json_schema -> llama.cpp grammar) | free (no constraint).
Sets: prod (cloud production_prompt records, model_fields only, '' = abstain) | v1dev (diagnostic; v1 test already used)."""
import json,sys,time,urllib.request,argparse
from common import norm,parse,SYSTEM,user_msg,score
ap=argparse.ArgumentParser();ap.add_argument("--port",default="8091");ap.add_argument("--tag");ap.add_argument("--mode");ap.add_argument("--set");ap.add_argument("--qwen3",action="store_true")
a=ap.parse_args()
def chat(msgs,schema):
    body={"messages":msgs,"temperature":0,"seed":0,"max_tokens":256,"cache_prompt":False}
    if a.qwen3:body["chat_template_kwargs"]={"enable_thinking":False}
    if schema:body["response_format"]={"type":"json_schema","json_schema":{"name":"f","schema":schema,"strict":True}}
    r=urllib.request.Request(f"http://127.0.0.1:{a.port}/v1/chat/completions",json.dumps(body).encode(),{"Content-Type":"application/json"})
    t=time.time();d=json.load(urllib.request.urlopen(r,timeout=600));return d["choices"][0]["message"]["content"],d.get("usage",{}),time.time()-t
out=open(f"runs/llama_{a.tag}_{a.set}_{a.mode}.jsonl","w");rows=[]
if a.set=="prod":
  c=dict(supported_correct=0,supported_wrong=0,spurious_unsupported_fill=0,missed=0,correct_empty=0,malformed=0,fields=0)
  for sp in["train","dev","test"]:
    for l in open(f"prod/forms-filler/data/{sp}.jsonl"):
      e=json.loads(l);txt,u,s=chat([{"role":"user","content":e["production_prompt"]}],e["production_schema"] if a.mode=="schema" else None)
      p=parse(txt);mal=p is None or not isinstance(p,dict)
      if mal:c["malformed"]+=1;p={}
      for f in e["model_fields"]:
        k=f["id"];g=norm(e["gold"].get(k));v=norm(p.get(k));c["fields"]+=1
        c["correct_empty" if g is None and v is None else "spurious_unsupported_fill" if g is None else "missed" if v is None else "supported_correct" if v==g else "supported_wrong"]+=1
      out.write(json.dumps(dict(id=e["id"],raw=txt,usage=u,sec=round(s,2),gold={f["id"]:e["gold"].get(f["id"]) for f in e["model_fields"]}))+"\n");rows.append(s)
  m=c
else:
  res=[]
  for l in open("data/dev.jsonl"):
    e=json.loads(l);sch={"type":"object","properties":{L:{"type":["string","null"]} for L in e["labels"]},"required":e["labels"],"additionalProperties":False}
    txt,u,s=chat([{"role":"system","content":SYSTEM},{"role":"user","content":user_msg(e)}],sch if a.mode=="schema" else None)
    r=dict(id=e["id"],raw=txt,pred=parse(txt),gold=e["gold"],usage=u,sec=round(s,2));res.append(r);out.write(json.dumps(r,ensure_ascii=False)+"\n");rows.append(s)
  m=score(res)
m.update(tag=a.tag,set=a.set,mode=a.mode,sec_per_item=round(sum(rows)/len(rows),2),runtime="llama.cpp b12182 CPU, NOT WebGPU/WebLLM")
json.dump(m,open(f"runs/llama_{a.tag}_{a.set}_{a.mode}.metrics.json","w"),indent=1);print(json.dumps(m))
