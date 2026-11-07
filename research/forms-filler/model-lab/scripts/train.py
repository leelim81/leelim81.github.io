import json,time,torch,random,resource,argparse
from pathlib import Path
from transformers import AutoModelForCausalLM,AutoTokenizer
from peft import LoraConfig,get_peft_model
from common import *
ROOT=Path(__file__).resolve().parents[1]
ap=argparse.ArgumentParser();ap.add_argument("--model",default="Qwen/Qwen2.5-0.5B-Instruct");ap.add_argument("--out");ap.add_argument("--epochs",type=float,default=1);ap.add_argument("--lr",type=float,default=2e-4);ap.add_argument("--r",type=int,default=16);ap.add_argument("--threads",type=int,default=4);ap.add_argument("--accum",type=int,default=4)
a=ap.parse_args();torch.set_num_threads(a.threads);torch.manual_seed(0);random.seed(0)
tok=AutoTokenizer.from_pretrained(a.model);m=AutoModelForCausalLM.from_pretrained(a.model,dtype=torch.bfloat16)
m=get_peft_model(m,LoraConfig(r=a.r,lora_alpha=2*a.r,lora_dropout=0.05,target_modules=["q_proj","k_proj","v_proj","o_proj","gate_proj","up_proj","down_proj"],task_type="CAUSAL_LM"))
m.print_trainable_parameters();m.gradient_checkpointing_enable();m.enable_input_require_grads()
rows=[json.loads(l) for l in open(ROOT/"data/v1/train.jsonl")]
def enc(e):
    msgs=[{"role":"system","content":SYSTEM},{"role":"user","content":user_msg(e)}]
    p=tok.apply_chat_template(msgs,add_generation_prompt=True,tokenize=False)
    pi=tok(p)["input_ids"];ti=tok(target(e)+tok.eos_token)["input_ids"]
    return torch.tensor([pi+ti]),torch.tensor([[-100]*len(pi)+ti])
opt=torch.optim.AdamW([p for p in m.parameters() if p.requires_grad],lr=a.lr)
steps=int(len(rows)*a.epochs);log=open(a.out+".trainlog","w");t0=time.time();m.train()
order=[]
while len(order)<steps:o=list(range(len(rows)));random.shuffle(o);order+=o
for i,idx in enumerate(order[:steps]):
    x,y=enc(rows[idx]);lr=a.lr*min(1,(i+1)/30)*max(0.05,1-i/steps)
    for g in opt.param_groups:g["lr"]=lr
    loss=m(input_ids=x,labels=y).loss/a.accum;loss.backward()
    if (i+1)%a.accum==0:torch.nn.utils.clip_grad_norm_(m.parameters(),1.0);opt.step();opt.zero_grad()
    if i%20==0:log.write(json.dumps(dict(i=i,loss=round(loss.item()*a.accum,4),tok=x.shape[1],sec=round(time.time()-t0),rss=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss//1024))+"\n");log.flush()
m.save_pretrained(a.out);json.dump(dict(vars(a),train_sec=round(time.time()-t0),peak_rss_MB=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss//1024,examples_seen=steps),open(a.out+"/train_meta.json","w"),indent=1)
