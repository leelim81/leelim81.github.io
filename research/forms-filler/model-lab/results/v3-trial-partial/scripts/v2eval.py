"""v2 eval via llama-server. temperature 0, seed 0, max_tokens 96, ctx 1024 (browser parity), user turn = production_prompt verbatim.
schema mode: response_format json_object + asciiSchema(production_schema) (same as llm.js); free mode: no constraint.
Records with empty model_fields are skipped (parser solved; never counted as model success).
Writes predictions in score_v2.py format plus 'prodfilter' variant (drop values not literally present in the excerpt, case-insensitive; approximation of site's unsupported-value filter - see README)."""
import json,re,time,urllib.request,argparse,sys
sys.path.insert(0,"v2/v2-bundle/scripts")
ap=argparse.ArgumentParser();ap.add_argument("--port",default="8091");ap.add_argument("--tag");ap.add_argument("--mode");ap.add_argument("--split",default="dev");ap.add_argument("--qwen3",action="store_true");ap.add_argument("--data",default="v2/v2-bundle/data");ap.add_argument("--prefix",default="v2")
a=ap.parse_args()
def ascii_schema(s):
    p={k:{"type":"string","description":(re.sub(r"\s+"," ",re.sub(r"[^\x20-\x7E]"," ",str(v.get("description") or k))).strip()[:48] or k)} for k,v in s.get("properties",{}).items()}
    return {"type":"object","properties":p,"additionalProperties":False}
def parse(t):
    try:
        v=json.loads(t.strip());return v if isinstance(v,dict) else None
    except Exception:return None
out=open(f"runs/{a.prefix}_{a.tag}_{a.split}_{a.mode}.jsonl","w");lat=[];toks=[];trunc=0
for l in open(f"{a.data}/{a.split}.jsonl"):
    e=json.loads(l)
    if not e["model_fields"]:continue
    body={"messages":[{"role":"user","content":e["production_prompt"]}],"temperature":0,"seed":0,"max_tokens":96,"cache_prompt":False}
    if a.qwen3:body["chat_template_kwargs"]={"enable_thinking":False}
    if a.mode=="schema":body["response_format"]={"type":"json_object","schema":ascii_schema(e["production_schema"])}
    if a.mode=="schemareq":
        sc=ascii_schema(e["production_schema"]);sc["required"]=list(sc["properties"]);body["response_format"]={"type":"json_object","schema":sc}
    t=time.time();d=json.load(urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{a.port}/v1/chat/completions",json.dumps(body).encode(),{"Content-Type":"application/json"}),timeout=300));s=time.time()-t
    raw=d["choices"][0]["message"]["content"];fr=d["choices"][0].get("finish_reason");trunc+=fr=="length";u=d.get("usage",{})
    p=parse(raw);pf=None
    if p is not None:
        ex=e["excerpt"].upper();pf={k:(v if isinstance(v,str) and v.strip() and v.strip().upper() in ex else "") for k,v in p.items()}
    lat.append(s);toks.append(u.get("prompt_tokens",0))
    out.write(json.dumps(dict(id=e["id"],raw=raw,pred=p,pred_prodfilter=pf,finish=fr,usage=u,sec=round(s,2)))+"\n")
json.dump(dict(tag=a.tag,split=a.split,mode=a.mode,model_calls=len(lat),truncated_96=trunc,max_prompt_tokens=max(toks),sec_mean=round(sum(lat)/len(lat),2),sec_max=round(max(lat),2),runtime="llama.cpp b12182 CPU 4 threads; NOT WebGPU"),open(f"runs/{a.prefix}_{a.tag}_{a.split}_{a.mode}.run.json","w"),indent=1)
