/* One equivalence pass. Images stay outside the repo. Gold is used only to score. */
import { readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { prepare, run } from './rulenet_fast.mjs';
import { segmentsFromProb } from './postprocess.mjs';

const root = new URL('.', import.meta.url).pathname;
const meta = JSON.parse(readFileSync(root + 'rulenet.meta.json', 'utf8'));
const weights = readFileSync(root + 'rulenet.f32.bin');
const flat = new Float32Array(weights.buffer, weights.byteOffset, weights.byteLength / 4);
const gold = JSON.parse(readFileSync(root + 'rules-gold-v1.json', 'utf8'));
const P = prepare(meta, flat);

execFileSync('python3', ['-c', `
from PIL import Image
import json
gold=json.load(open(${JSON.stringify(root + 'rules-gold-v1.json')}))
src='/tmp/ff-natural-scans/ff-natural-scans/files/'
for name,g in gold['images'].items():
    im=Image.open(src+name+'.jpg').convert('RGB')
    W,H=g['working_size']
    if im.size!=(W,H): im=im.resize((W,H), Image.Resampling.LANCZOS)
    im.save('/tmp/rn-'+name+'.png')
    print(name, W, H)
`]);

function pyRound(x) {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return (f % 2 === 0) ? f : f + 1;
}

function score(name, segs) {
  const g = gold.images[name];
  const rules = g.rules.map((r) => r.slice(0, 3));
  const keep = segs.filter((s) => !g.ignore.some((ig) => s[0] < ig[1] && s[1] > ig[0] && ig[2] <= s[2] && s[2] <= ig[3]));
  const pairs = [];
  keep.forEach((s, i) => {
    rules.forEach((r, j) => {
      if (Math.abs(s[2] - r[2]) > 6) return;
      const ov = Math.min(s[1], r[1]) - Math.max(s[0], r[0]);
      if (ov >= 0.5 * (r[1] - r[0])) pairs.push([ov, i, j]);
    });
  });
  pairs.sort((a, b) => b[0] - a[0]);
  const ui = new Set();
  const uj = new Set();
  pairs.forEach((p) => { if (!ui.has(p[1]) && !uj.has(p[2])) { ui.add(p[1]); uj.add(p[2]); } });
  return { tp: uj.size, fp: keep.length - ui.size, fn: rules.length - uj.size, n: keep.length };
}

const report = [];
for (const name of Object.keys(gold.images)) {
  const [W, H] = gold.images[name].working_size;
  const png = readFileSync(`/tmp/rn-${name}.png`);
  execFileSync('python3', ['-c', `
import sys
from PIL import Image
import numpy as np
im=np.asarray(Image.open(sys.argv[1]).convert('RGB'))
im.tofile(sys.argv[2])
print(im.shape[1], im.shape[0])
`, '/tmp/rn-' + name + '.png', '/tmp/rn-' + name + '.rgb'], { encoding: 'utf8' });
  const rgb = readFileSync(`/tmp/rn-${name}.rgb`);
  const rgba = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    rgba[i * 4] = rgb[i * 3];
    rgba[i * 4 + 1] = rgb[i * 3 + 1];
    rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = 255;
  }
  const t0 = Date.now();
  const prob = run(P, rgba, W, H);
  const inferMs = Date.now() - t0;
  const segs = segmentsFromProb(prob, rgba, W, H);
  writeFileSync('/tmp/rn-prob.bin', Buffer.from(prob.buffer, prob.byteOffset, prob.byteLength));
  writeFileSync('/tmp/rn-rgba.bin', Buffer.from(rgba.buffer));
  const cv = JSON.parse(execFileSync('python3', ['-c', `
import json, sys
import cv2, numpy as np
w,h=map(int, sys.argv[1:3])
prob=np.fromfile('/tmp/rn-prob.bin', dtype='<f4').reshape(h,w)
rgba=np.fromfile('/tmp/rn-rgba.bin', dtype=np.uint8).reshape(h,w,4)
rgb=rgba[:,:,:3]
mask=(prob>0.5).astype(np.uint8)
f=4
small=cv2.resize(rgb,(w//f,h//f),interpolation=cv2.INTER_AREA)
bg=np.stack([cv2.medianBlur(small[...,c],9) for c in range(3)],-1)
bg=cv2.dilate(bg,np.ones((3,3),np.uint8))
bg=cv2.resize(bg,(w,h),interpolation=cv2.INTER_LINEAR).astype(np.float32)
luma=(0.299*bg[...,0]+0.587*bg[...,1]+0.114*bg[...,2])/255.
pm=(luma>=0.35).astype(np.uint8)
pm=cv2.erode(pm,np.ones((9,9),np.uint8))
k=max(15,w//40)
op=cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT,(k,1)))
op=op*pm
n,lab,st,cen=cv2.connectedComponentsWithStats(op,8)
segs=[]
for i in range(1,n):
    x,y,ww,hh,a=st[i]
    if ww<40 or hh>max(12,ww/6): continue
    ys,xs=np.nonzero(lab[y:y+hh,x:x+ww]==i)
    segs.append([int(x),int(x+ww),float(y+ys.mean())])
segs.sort(key=lambda s:(round(s[2]),s[0]))
merged=[]
for s in segs:
    for m in merged:
        if abs(m[2]-s[2])<=4 and s[0]-m[1]<=12 and m[0]-s[1]<=12:
            L1=m[1]-m[0]; L2=s[1]-s[0]
            m[2]=(m[2]*L1+s[2]*L2)/(L1+L2); m[0]=min(m[0],s[0]); m[1]=max(m[1],s[1]); break
    else:
        merged.append(list(s))
print(json.dumps(merged))
`, String(W), String(H)], { encoding: 'utf8' }));
  let maxDx = 0;
  const identical = cv.length === segs.length && cv.every((s, i) => {
    maxDx = Math.max(maxDx, Math.abs(s[0] - segs[i][0]), Math.abs(s[1] - segs[i][1]), Math.abs(s[2] - segs[i][2]));
    return Math.abs(s[0] - segs[i][0]) <= 1e-3 && Math.abs(s[1] - segs[i][1]) <= 1e-3 && Math.abs(s[2] - segs[i][2]) <= 1e-3;
  });
  const scored = score(name, segs);
  report.push({ name, w: W, h: H, inferMs, n: segs.length, identical, maxDx, score: scored });
  console.log(JSON.stringify(report[report.length - 1]));
}
writeFileSync(root + 'equivalence.json', JSON.stringify(report, null, 2));
