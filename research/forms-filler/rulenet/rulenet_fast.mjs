// RuleNet v1 weights, optimized plain-JS forward pass (no deps, no WASM). Mathematically equivalent to v1-frozen/js/rulenet.mjs:
// HWC layouts, per-pixel fused depthwise->pointwise, in-place residual, 1x1 projection of the 32-ch branch BEFORE the (linear)
// bilinear upsample, rolling 3-row band for the 1/2-res fuse head. Float32 storage, JS double accumulation inside a pixel.
export function prepare(meta, flat){
  let o=0; const L={};
  for(const l of meta){ const n=l.shape.reduce((a,b)=>a*b,1); L[l.name]={...l,w:flat.subarray(o,o+n),b:flat.subarray(o+n,o+n+l.shape[0])}; o+=n+l.shape[0]; }
  // transpose dense convs to [tap][ci][co] for contiguous co
  const T=(l)=>{const [Co,Ci,kh,kw]=l.shape; const t=new Float32Array(Co*Ci*kh*kw);
    for(let co=0;co<Co;co++)for(let ci=0;ci<Ci;ci++)for(let k=0;k<kh*kw;k++) t[(k*Ci+ci)*Co+co]=l.w[(co*Ci+ci)*kh*kw+k]; return t;};
  const P={s1w:T(L.s1),s1b:L.s1.b,s2w:T(L.s2),s2b:L.s2.b,blocks:[]};
  P.s2tT=new Float32Array(32*108); for(let co=0;co<32;co++) for(let ci=0;ci<12;ci++) for(let k=0;k<9;k++) P.s2tT[co*108+k*12+ci]=L.s2.w[(co*12+ci)*9+k];
  for(let i=0;i<6;i++){ const dwh=L[`b${i}.dwh`],pw1=L[`b${i}.pw1`],dw3=L[`b${i}.dw3`],pw2=L[`b${i}.pw2`];
    const C=32, dh=new Float32Array(9*C), d3=new Float32Array(9*C);
    for(let c=0;c<C;c++)for(let k=0;k<9;k++){ dh[k*C+c]=dwh.w[c*9+k]; d3[k*C+c]=dw3.w[c*9+k]; }
    P.blocks.push({dil:dwh.dil[1],dh,dhb:dwh.b,p1:pw1.w,p1b:pw1.b,d3,d3b:dw3.b,p2:pw2.w,p2b:pw2.b}); }
  const f0=L.f0; // [16,44,1,1]; cols 0..11 -> a, 12..43 -> b
  const fa=new Float32Array(12*16), fb=new Float32Array(32*16);
  for(let co=0;co<16;co++){ for(let ci=0;ci<12;ci++) fa[ci*16+co]=f0.w[co*44+ci]; for(let ci=0;ci<32;ci++) fb[ci*16+co]=f0.w[co*44+12+ci]; }
  const f1=new Float32Array(9*16); for(let c=0;c<16;c++)for(let k=0;k<9;k++) f1[k*16+c]=L.f1.w[c*9+k];
  Object.assign(P,{fa,fb,f0b:f0.b,f1,f1b:L.f1.b,f2:L.f2.w,f2b:L.f2.b[0]}); return P;
}
// pointwise 32->32: res=false: dst=relu(W t + bias) ; res=true: dst=relu(dst + W t + bias)
function PW1(t,w,bias,dst,o,relu){ const C=32;
  for(let co=0;co<C;co+=4){ let s0=bias[co],s1=bias[co+1],s2=bias[co+2],s3=bias[co+3]; const w0=co*C,w1=w0+C,w2=w1+C,w3=w2+C;
    for(let ci=0;ci<C;ci++){ const v=t[ci]; s0+=v*w[w0+ci]; s1+=v*w[w1+ci]; s2+=v*w[w2+ci]; s3+=v*w[w3+ci]; }
    if(relu){ dst[o+co]=s0>0?s0:0; dst[o+co+1]=s1>0?s1:0; dst[o+co+2]=s2>0?s2:0; dst[o+co+3]=s3>0?s3:0; }
    else { let v=dst[o+co]+s0; dst[o+co]=v>0?v:0; v=dst[o+co+1]+s1; dst[o+co+1]=v>0?v:0; v=dst[o+co+2]+s2; dst[o+co+2]=v>0?v:0; v=dst[o+co+3]+s3; dst[o+co+3]=v>0?v:0; } } }
function PW2(t,u,w,bias,dst,o,o2,relu){ const C=32;
  for(let co=0;co<C;co+=4){ let s0=bias[co],s1=bias[co+1],s2=bias[co+2],s3=bias[co+3]; let r0=s0,r1=s1,r2=s2,r3=s3; const w0=co*C,w1=w0+C,w2=w1+C,w3=w2+C;
    for(let ci=0;ci<C;ci++){ const v=t[ci], x=u[ci], a0=w[w0+ci],a1=w[w1+ci],a2=w[w2+ci],a3=w[w3+ci]; s0+=v*a0; s1+=v*a1; s2+=v*a2; s3+=v*a3; r0+=x*a0; r1+=x*a1; r2+=x*a2; r3+=x*a3; }
    if(relu){ dst[o+co]=s0>0?s0:0; dst[o+co+1]=s1>0?s1:0; dst[o+co+2]=s2>0?s2:0; dst[o+co+3]=s3>0?s3:0; dst[o2+co]=r0>0?r0:0; dst[o2+co+1]=r1>0?r1:0; dst[o2+co+2]=r2>0?r2:0; dst[o2+co+3]=r3>0?r3:0; }
    else { let v=dst[o+co]+s0; dst[o+co]=v>0?v:0; v=dst[o+co+1]+s1; dst[o+co+1]=v>0?v:0; v=dst[o+co+2]+s2; dst[o+co+2]=v>0?v:0; v=dst[o+co+3]+s3; dst[o+co+3]=v>0?v:0;
      v=dst[o2+co]+r0; dst[o2+co]=v>0?v:0; v=dst[o2+co+1]+r1; dst[o2+co+1]=v>0?v:0; v=dst[o2+co+2]+r2; dst[o2+co+2]=v>0?v:0; v=dst[o2+co+3]+r3; dst[o2+co+3]=v>0?v:0; } } }
function upCoef(n,N){ // bilinear align_corners=false, src size n -> dst N
  const i0=new Int32Array(N),i1=new Int32Array(N),f=new Float32Array(N),s=n/N;
  for(let j=0;j<N;j++){ let v=Math.max(0,(j+0.5)*s-0.5); i0[j]=Math.min(n-1,Math.floor(v)); i1[j]=Math.min(n-1,i0[j]+1); f[j]=v-i0[j]; } return {i0,i1,f};
}
export function run(P,rgba,W,H,out){
  const Ha=H>>1,Wa=W>>1,Hb=H>>2,Wb=W>>2, C=32;
  const key=W+'x'+H; if(P._ws?.key!==key) P._ws={key,a:new Float32Array(Ha*Wa*12),b:new Float32Array(Hb*Wb*C),U:new Float32Array(Hb*Wb*C),Pb:new Float32Array(Hb*Wb*16),Lg:new Float32Array(Ha*Wa)};
  const WS=P._ws;
  const lut=new Float32Array(256); for(let i=0;i<256;i++) lut[i]=i/255-0.5;
  // s1: 3->12 3x3 s2 p1 + ReLU, output HWC
  const a=WS.a, acc=new Float64Array(32), s1w=P.s1w,s1b=P.s1b;
  for(let i=0;i<Ha;i++) for(let j=0;j<Wa;j++){
    for(let c=0;c<12;c++) acc[c]=s1b[c];
    for(let ky=0;ky<3;ky++){ const iy=2*i-1+ky; if(iy<0||iy>=H) continue;
      for(let kx=0;kx<3;kx++){ const ix=2*j-1+kx; if(ix<0||ix>=W) continue; const p=(iy*W+ix)*4, k=ky*3+kx;
        for(let ci=0;ci<3;ci++){ const v=lut[rgba[p+ci]], wo=(k*3+ci)*12; for(let c=0;c<12;c++) acc[c]+=v*s1w[wo+c]; } } }
    const o=(i*Wa+j)*12; for(let c=0;c<12;c++){ const v=acc[c]; a[o+c]=v>0?v:0; } }
  // s2: 12->32 3x3 s2 p1 + ReLU
  let b=WS.b; const s2w=P.s2w,s2b=P.s2b;
  const g=new Float32Array(108), s2t=P.s2tT;
  for(let i=0;i<Hb;i++) for(let j=0;j<Wb;j++){
    for(let ky=0;ky<3;ky++){ const iy=2*i-1+ky; for(let kx=0;kx<3;kx++){ const ix=2*j-1+kx, k=(ky*3+kx)*12;
      if(iy<0||iy>=Ha||ix<0||ix>=Wa){ for(let ci=0;ci<12;ci++) g[k+ci]=0; } else { const p=(iy*Wa+ix)*12; for(let ci=0;ci<12;ci++) g[k+ci]=a[p+ci]; } } }
    const o=(i*Wb+j)*C;
    for(let co=0;co<C;co+=4){ let s0=s2b[co],s1=s2b[co+1],s2=s2b[co+2],s3=s2b[co+3]; const w0=co*108,w1=w0+108,w2=w1+108,w3=w2+108;
      for(let q=0;q<108;q++){ const v=g[q]; s0+=v*s2t[w0+q]; s1+=v*s2t[w1+q]; s2+=v*s2t[w2+q]; s3+=v*s2t[w3+q]; }
      b[o+co]=s0>0?s0:0; b[o+co+1]=s1>0?s1:0; b[o+co+2]=s2>0?s2:0; b[o+co+3]=s3>0?s3:0; } }
  // blocks
  const U=WS.U, t=new Float32Array(C), t2=new Float32Array(C);
  for(const B of P.blocks){ const d=B.dil, dh=B.dh,dhb=B.dhb,p1=B.p1,p1b=B.p1b,d3=B.d3,d3b=B.d3b,p2=B.p2,p2b=B.p2b;
    for(let i=0;i<Hb;i++){ const row=i*Wb;
      for(let j=0;j<Wb;j+=2){ const two=j+1<Wb;
        for(let q=0;q<(two?2:1);q++){ const jj=j+q, tt=q?t2:t; let k0=0,k1=9; while(jj+(k0-4)*d<0) k0++; while(jj+(k1-5)*d>=Wb) k1--;
          for(let c=0;c<C;c+=4){ let s0=dhb[c],s1=dhb[c+1],s2=dhb[c+2],s3=dhb[c+3];
            for(let k=k0;k<k1;k++){ const p=(row+jj+(k-4)*d)*C+c, w=k*C+c; s0+=b[p]*dh[w]; s1+=b[p+1]*dh[w+1]; s2+=b[p+2]*dh[w+2]; s3+=b[p+3]*dh[w+3]; }
            tt[c]=s0; tt[c+1]=s1; tt[c+2]=s2; tt[c+3]=s3; } }
        const o=(row+j)*C;
        if(two) PW2(t,t2,p1,p1b,U,o,o+C,true); else PW1(t,p1,p1b,U,o,true); } }
    for(let i=0;i<Hb;i++){ const y0=i>0?-1:0, y1=i+1<Hb?1:0;
      for(let j=0;j<Wb;j+=2){ const two=j+1<Wb;
        for(let q=0;q<(two?2:1);q++){ const jj=j+q, tt=q?t2:t, x0=jj>0?-1:0, x1=jj+1<Wb?1:0;
          for(let c=0;c<C;c+=4){ let s0=d3b[c],s1=d3b[c+1],s2=d3b[c+2],s3=d3b[c+3];
            for(let dy=y0;dy<=y1;dy++) for(let dx=x0;dx<=x1;dx++){ const p=((i+dy)*Wb+jj+dx)*C+c, w=((dy+1)*3+dx+1)*C+c; s0+=U[p]*d3[w]; s1+=U[p+1]*d3[w+1]; s2+=U[p+2]*d3[w+2]; s3+=U[p+3]*d3[w+3]; }
            tt[c]=s0; tt[c+1]=s1; tt[c+2]=s2; tt[c+3]=s3; } }
        const o=(i*Wb+j)*C;
        if(two) PW2(t,t2,p2,p2b,b,o,o+C,false); else PW1(t,p2,p2b,b,o,false); } } }
  // project 32-ch branch to 16 ch at 1/4 res (no bias) — linear, commutes with bilinear upsample
  const Pb=WS.Pb, fb=P.fb;
  for(let p=0;p<Hb*Wb;p++){ for(let c=0;c<16;c++) acc[c]=0; const q=p*C; for(let ci=0;ci<C;ci++){ const v=b[q+ci]; if(v===0) continue; const wo=ci*16; for(let c=0;c<16;c++) acc[c]+=v*fb[wo+c]; } const o=p*16; for(let c=0;c<16;c++) Pb[o+c]=acc[c]; }
  // fuse head with rolling 3-row ring of f0 rows (1/2 res)
  const ux=upCoef(Wb,Wa), uy=upCoef(Hb,Ha), ring=[new Float32Array(Wa*16),new Float32Array(Wa*16),new Float32Array(Wa*16)], have=[-9,-9,-9];
  const fa=P.fa,f0b=P.f0b,f1=P.f1,f1b=P.f1b,f2=P.f2,f2b=P.f2b, Lg=WS.Lg;
  const f0row=(k)=>{ const s=k%3; if(have[s]===k) return ring[s]; const R=ring[s]; have[s]=k;
    const y0=uy.i0[k]*Wb, y1=uy.i1[k]*Wb, fy=uy.f[k];
    for(let j=0;j<Wa;j++){ const x0=ux.i0[j],x1=ux.i1[j],fx=ux.f[j], p00=(y0+x0)*16,p01=(y0+x1)*16,p10=(y1+x0)*16,p11=(y1+x1)*16, pa=(k*Wa+j)*12;
      for(let c=0;c<16;c++){ const top=Pb[p00+c]+(Pb[p01+c]-Pb[p00+c])*fx, bot=Pb[p10+c]+(Pb[p11+c]-Pb[p10+c])*fx; acc[c]=f0b[c]+top+(bot-top)*fy; }
      for(let ci=0;ci<12;ci++){ const v=a[pa+ci]; if(v===0) continue; const wo=ci*16; for(let c=0;c<16;c++) acc[c]+=v*fa[wo+c]; }
      const o=j*16; for(let c=0;c<16;c++){ const v=acc[c]; R[o+c]=v>0?v:0; } } return R; };
  for(let i=0;i<Ha;i++){ const rows=[i>0?f0row(i-1):null,f0row(i),i+1<Ha?f0row(i+1):null];
    for(let j=0;j<Wa;j++){
      for(let c=0;c<16;c++) t[c]=f1b[c];
      for(let ky=0;ky<3;ky++){ const R=rows[ky]; if(!R) continue; for(let kx=0;kx<3;kx++){ const ix=j-1+kx; if(ix<0||ix>=Wa) continue; const p=ix*16, wo=(ky*3+kx)*16; for(let c=0;c<16;c++) t[c]+=R[p+c]*f1[wo+c]; } }
      let s=f2b; for(let c=0;c<16;c++){ const v=t[c]; if(v>0) s+=v*f2[c]; } Lg[i*Wa+j]=s; } }
  // final 2x bilinear + sigmoid
  const vx=upCoef(Wa,W), vy=upCoef(Ha,H); out=out||new Float32Array(H*W);
  for(let i=0;i<H;i++){ const r0=vy.i0[i]*Wa, r1=vy.i1[i]*Wa, fy=vy.f[i], o=i*W;
    for(let j=0;j<W;j++){ const x0=vx.i0[j],x1=vx.i1[j],fx=vx.f[j]; const top=Lg[r0+x0]+(Lg[r0+x1]-Lg[r0+x0])*fx, bot=Lg[r1+x0]+(Lg[r1+x1]-Lg[r1+x0])*fx; out[o+j]=1/(1+Math.exp(-(top+(bot-top)*fy))); } }
  return out;
}
