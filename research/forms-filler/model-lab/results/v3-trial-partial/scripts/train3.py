"""v3 LoRA: supervise target_json given production_prompt (single user turn, Qwen chat template). Single bounded trial."""
import json,time,torch,random,resource,argparse
from transformers import AutoModelForCausalLM,AutoTokenizer
from peft import LoraConfig,get_peft_model
ap=argparse.ArgumentParser();ap.add_argument("--model",default="Qwen/Qwen2.5-0.5B-Instruct");ap.add_argument("--data",default="v3/forms-filler-lab-v3/data/train.jsonl");ap.add_argument("--out");ap.add_argument("--epochs",type=float,default=1);ap.add_argument("--lr",type=float,default=1e-4);ap.add_argument("--r",type=int,default=8);ap.add_argument("--threads",type=int,default=4);ap.add_argument("--accum",type=int,default=8);ap.add_argument("--seed",type=int,default=1109)
a=ap.parse_args();torch.set_num_threads(a.threads);torch.manual_seed(a.seed);random.seed(a.seed)
tok=AutoTokenizer.from_pretrained(a.model);m=AutoModelForCausalLM.from_pretrained(a.model,dtype=torch.bfloat16)
m=get_peft_model(m,LoraConfig(r=a.r,lora_alpha=2*a.r,lora_dropout=0.05,target_modules=["q_proj","k_proj","v_proj","o_proj","gate_proj","up_proj","down_proj"],task_type="CAUSAL_LM"))
m.gradient_checkpointing_enable();m.enable_input_require_grads()
rows=[json.loads(l) for l in open(a.data)]
def enc(e):
    p=tok.apply_chat_template([{"role":"user","content":e["production_prompt"]}],add_generation_prompt=True,tokenize=False)
    pi=tok(p)["input_ids"];ti=tok(e["target_json"]+"<|im_end|>")["input_ids"]
    return torch.tensor([pi+ti]),torch.tensor([[-100]*len(pi)+ti])
opt=torch.optim.AdamW([p for p in m.parameters() if p.requires_grad],lr=a.lr,weight_decay=0.0)
steps=int(len(rows)*a.epochs);order=[]
while len(order)<steps:o=list(range(len(rows)));random.shuffle(o);order+=o
log=open(a.out+".trainlog","w");t0=time.time();m.train();maxtok=0
for i,idx in enumerate(order[:steps]):
    x,y=enc(rows[idx]);maxtok=max(maxtok,x.shape[1]);lr=a.lr*min(1,(i+1)/24)*max(0.05,1-i/steps)
    for g in opt.param_groups:g["lr"]=lr
    loss=m(input_ids=x,labels=y).loss/a.accum;loss.backward()
    if (i+1)%a.accum==0:torch.nn.utils.clip_grad_norm_(m.parameters(),1.0);opt.step();opt.zero_grad()
    if i%20==0:log.write(json.dumps(dict(i=i,loss=round(loss.item()*a.accum,4),tok=x.shape[1],sec=round(time.time()-t0),rss=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss//1024))+"\n");log.flush()
m.save_pretrained(a.out)
mm=m.merge_and_unload();mm.save_pretrained(a.out+"-merged");tok.save_pretrained(a.out+"-merged")
json.dump(dict(vars(a),train_sec=round(time.time()-t0),peak_rss_MB=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss//1024,examples_seen=steps,max_seq_tokens=maxtok),open(a.out+"/train_meta.json","w"),indent=1)
