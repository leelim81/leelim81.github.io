"""Synthetic SG reference->form JSON task. Fully random fictional identities. Seeded, reproducible."""
import json,random,hashlib
R=random.Random(20261107)
SUR=["TAN","LIM","LEE","NG","ONG","WONG","GOH","CHUA","KOH","TEO","ANG","YEO","SIM","LOW","HO","CHIA","QUEK","SEAH","PHUA","TOH"]
GIV=["WEI MING","SIEW LING","JUN HAO","MEI XIN","KAI WEN","HUI MIN","ZHI HAO","LI TING","JIA HUI","YONG SHENG","PEI SHAN","WEN JIE","XIN YI","CHENG EN","RUI EN"]
MALAY=["NUR AISYAH BINTE AHMAD","MUHAMMAD HAFIZ BIN ISMAIL","SITI NORHAYATI BINTE OSMAN","AHMAD FAIZAL BIN RAHMAN"]
IND=["PRIYA D/O RAMAN","ARJUN S/O KUMAR","KAVITHA D/O SURESH","RAJESH S/O NAIR"]
STREETS=["ANG MO KIO AVE 3","BEDOK NORTH ST 1","TAMPINES ST 21","JURONG WEST ST 52","WOODLANDS DR 14","PUNGGOL FIELD","YISHUN RING RD","CLEMENTI AVE 2","TOA PAYOH LOR 1","HOUGANG AVE 8","BUKIT BATOK ST 31","PASIR RIS DR 6"]
JOBS=["Nurse","Accountant","Teacher","Software Engineer","Bus Captain","Hawker","Sales Executive","Technician","Student"]
REL=["Spouse","Mother","Father","Sister","Brother","Friend"]
RACES=["Chinese","Malay","Indian","Others"]
def nric(r,pre="S"):
    d=[r.randint(0,9) for _ in range(7)];w=[2,7,6,5,4,3,2];s=sum(a*b for a,b in zip(d,w))+(4 if pre in"TG" else 0)
    st="JZIHGFEDCBA" if pre in "ST" else "XWUTRQPNMLK";return pre+"".join(map(str,d))+st[s%11]
def person(r):
    k=r.random()
    if k<.6:name=r.choice(SUR)+" "+r.choice(GIV);race="Chinese"
    elif k<.8:name=r.choice(MALAY);race="Malay"
    else:name=r.choice(IND);race="Indian"
    y=r.randint(1955,2005);m=r.randint(1,12);d=r.randint(1,28)
    blk=str(r.randint(100,999))+r.choice(["","","A","B"]);unit=f"{r.randint(2,25):02d}-{r.randint(1,999):03d}"
    cit=r.choice(["Singapore Citizen","Singapore Citizen","Permanent Resident","Foreigner"])
    pre="S" if y<2000 else "T"
    if cit=="Foreigner":pre="G"
    return dict(name=name,nric=nric(r,pre),dob=f"{y:04d}-{m:02d}-{d:02d}",sex=r.choice(["Male","Female"]),race=race,
      blk=blk,unit=unit,street=r.choice(STREETS),postal=f"{r.randint(1,82):02d}{r.randint(0,9999):04d}",
      phone=r.choice("89")+"".join(str(r.randint(0,9)) for _ in range(7)),email=None,job=r.choice(JOBS),cit=cit,
      rel=r.choice(REL))
def fmt_date(iso,v):
    y,m,d=iso.split("-");M=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][int(m)-1]
    return [f"{d}-{m}-{y}",f"{d}/{m}/{y}",f"{int(d)} {M.title()} {y}",f"{d} {M} {y}"][v]
def fmt_phone(p,v):return [p,f"+65 {p[:4]} {p[4:]}",f"{p[:4]}-{p[4:]}",f"(65) {p}"][v]
def noise(s,r,lvl):
    if lvl==0:return s
    sub={"0":"O","1":"I","5":"S","8":"B"};out=[]
    for ch in s:
        if ch in sub and r.random()<0.04*lvl and not ch.isalpha():out.append(sub[ch])
        else:out.append(ch)
    return "".join(out)
# reference document templates (families). split by template.
def t_nric_card(a,r,c):  # OCR-like card; no phone/email/job
    return f"REPUBLIC OF SINGAPORE\nIDENTITY CARD No. {a['nric']}\nName\n{a['name']}\nRace {a['race'].upper()}\nDate of birth {fmt_date(a['dob'],c['dv'])}  Sex {a['sex'][0]}\nCountry of birth SINGAPORE\nAddress\nBLK {a['blk']} {a['street']} #{a['unit']} SINGAPORE {a['postal']}",{"name","nric","dob","sex","race","blk","unit","street","postal"}
def t_letter(a,r,c):
    b=c['b'];return f"Dear {a['name'].title()},\nThank you for registering. We have your mobile as {fmt_phone(a['phone'],c['pv'])} and will mail your card to Blk {a['blk']}, {a['street'].title()}, #{a['unit']}, S({a['postal']}).\nYour emergency contact {b['name'].title()} ({a['rel'].lower()}) can be reached at {fmt_phone(b['phone'],0)}.",{"name","phone","blk","street","unit","postal","em_name","em_phone","em_rel"}
def t_payslip(a,r,c):
    return f"PAYSLIP  Oct 2026\nEmployee: {a['name']}   ID: {a['nric']}\nDesignation: {a['job']}\nEmployer: {r.choice(['ACME PTE LTD','SUNRISE LOGISTICS PTE LTD','HARBOUR F&B PTE LTD'])}\nBasic {r.randint(2,7)}000.00  CPF (Employee) deducted",{"name","nric","job"}
def t_chat(a,r,c):
    b=c['b'];return f"Hi, the form is for me, {a['name'].title()}. My HP is {fmt_phone(a['phone'],c['pv'])} and I was born on {fmt_date(a['dob'],c['dv'])}. For emergency please put my {a['rel'].lower()} {b['name'].title()}, I don't have their number with me now.",{"name","phone","dob","em_name","em_rel","em_phone_absent"}
def t_utility(a,r,c):
    return f"SP SERVICES BILL\nAccount holder: {a['name']}\nPremises: {a['blk']} {a['street']} #{a['unit']} Singapore {a['postal']}\nAmount due: ${r.randint(40,300)}.{r.randint(10,99)}",{"name","blk","street","unit","postal"}
def t_clinic(a,r,c):
    b=c['b'];return f"CLINIC REGISTRATION (copy)\nPatient: {b['name']}  NRIC {b['nric']}  DOB {fmt_date(b['dob'],c['dv'])}\nAccompanied by: {a['name']} ({a['rel']}) Tel {fmt_phone(a['phone'],c['pv'])}",{"OTHER_PERSON","name","phone"}
def t_workpass(a,r,c):
    a['nric']=nric(r,'G') if a['nric'][0]!='G' else a['nric']
    return f"Employment details\nName: {a['name']}\nFIN: {a['nric']}\nPass type: S Pass\nOccupation: {a['job']}\nNationality: MALAYSIAN",{"name","nric","job","cit_foreign"}
TEMPLATES={"nric_card":t_nric_card,"letter":t_letter,"payslip":t_payslip,"chat":t_chat,"utility":t_utility,"clinic":t_clinic,"workpass":t_workpass}
# target form label sets (paraphrase families) -> canonical key
LABELS={
 "A":{"Full Name (as in NRIC)":"name","NRIC/FIN No.":"nric","Date of Birth (DD/MM/YYYY)":"dob","Gender":"sex","Race":"race","Blk/House No.":"blk","Unit No.":"unit","Street Name":"street","Postal Code":"postal","Mobile No.":"phone","Email":"email","Occupation":"job","Citizenship [Singapore Citizen/PR/Others]":"cit","Emergency Contact Name":"em_name","Emergency Contact Relationship":"em_rel","Emergency Contact Phone":"em_phone"},
 "B":{"Applicant's name":"name","Identification number":"nric","Birth date":"dob","Sex (M/F)":"sex","Ethnic group":"race","Block":"blk","Floor-Unit":"unit","Road":"street","Postcode":"postal","Contact number":"phone","E-mail address":"email","Job title":"job","Residential status":"cit","Next-of-kin name":"em_name","Relationship to applicant":"em_rel","Next-of-kin tel":"em_phone"},
 "C":{"Name of member":"name","ID No.":"nric","D.O.B.":"dob","☐ Male ☐ Female":"sex","☐ Chinese ☐ Malay ☐ Indian ☐ Others":"race","Address: Block":"blk","Address: #Unit":"unit","Address: Street":"street","Address: S( )":"postal","Handphone":"phone","Email (optional)":"email","Designation":"job","☐ SC ☐ PR ☐ Foreigner":"cit","In case of emergency, contact":"em_name","Relation":"em_rel","Emergency tel.":"em_phone"},
}
def gold_val(key,a,b,avail,fam):
    if key=="em_phone" and "em_phone_absent" in avail:return None
    if key.startswith("em_"):
        if key not in avail:return None
        return {"em_name":b["name"],"em_rel":a["rel"],"em_phone":b["phone"]}[key]
    if key not in avail:
        if key=="cit" and "cit_foreign" in avail:return "Foreigner" if fam!="C" else "Foreigner"
        return None
    v=a[key]
    if key=="dob":y,m,d=v.split("-");return f"{d}/{m}/{y}"
    if key=="sex" and fam=="B":return v[0]
    if key=="unit":return "#"+v
    if key=="name":return v.upper()
    return v
def example(tid,fam,r,nl):
    a=person(r);b=person(r);c=dict(dv=r.randint(0,3),pv=r.randint(0,3),b=b)
    keys=TEMPLATES[tid]
    docs=[];avail=set()
    k=r.random()
    picks=[tid] if k<0.5 else [tid,r.choice([t for t in TEMPLATES if t!=tid and t in ALLOWED[tid]])]
    for p in picks:
        txt,av=TEMPLATES[p](a,r,c);docs.append(noise(txt,r,nl));avail|=av
    if "OTHER_PERSON" in avail:  # clinic copy is about another person: applicant fields not from patient
        avail.discard("OTHER_PERSON")
    labs=LABELS[fam];gold={L:gold_val(k2,a,b,avail,fam) for L,k2 in labs.items()}
    return dict(template=tid,label_family=fam,noise=nl,docs=docs,labels=list(labs),gold=gold,identity_hash=hashlib.sha256((a['nric']+b['nric']).encode()).hexdigest()[:12],ids=[a['nric'],b['nric']])
ALLOWED={t:set(TEMPLATES) for t in TEMPLATES}
SPLIT={"train":(["nric_card","letter","payslip","utility"],["A","B"]),"dev":(["chat","nric_card","letter"],["B","A"]),"test":(["clinic","workpass","chat"],["C"])}
N={"train":900,"dev":40,"test":80}
def main():
    seen=set();out={}
    for sp,(tids,fams) in SPLIT.items():
        rows=[]
        while len(rows)<N[sp]:
            tid=R.choice(tids);fam=R.choice(fams)
            for t in TEMPLATES:ALLOWED[t]=set(tids)
            e=example(tid,fam,R,R.choice([0,0,1,2]))
            if any(i in seen for i in e["ids"]):continue
            seen|=set(e["ids"]);del e["ids"];e["id"]=f"{sp}-{len(rows):04d}";rows.append(e)
        out[sp]=rows
        with open(f"data/{sp}.jsonl","w") as f:
            for e in rows:f.write(json.dumps(e,ensure_ascii=False)+"\n")
    man={}
    for sp in out:
        b=open(f"data/{sp}.jsonl","rb").read();vals=[v for e in out[sp] for v in e["gold"].values()]
        man[sp]=dict(n=len(out[sp]),sha256=hashlib.sha256(b).hexdigest(),null_frac=round(sum(v is None for v in vals)/len(vals),3),templates=sorted({e["template"] for e in out[sp]}),label_families=sorted({e["label_family"] for e in out[sp]}))
    json.dump(man,open("data/MANIFEST.json","w"),indent=1);print(json.dumps(man,indent=1))
if __name__=="__main__":main()
