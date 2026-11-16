import fs from 'node:fs';
import { buildHull } from '../../xs-editor/hull.js';
const u=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const items=[];const walk=o=>{if(Array.isArray(o))o.forEach(walk);else if(o&&typeof o==='object'){if(o.kind==='hull'&&o.planes&&o.op!=='sub')items.push(o);else Object.values(o).forEach(walk);}};walk(u.userParts);
const pts=[];
for(const it of items){const h=buildHull(it.planes,{});const q=h.positions;const add=(a,b,c)=>{for(let i=0;i<=6;i++)for(let j=0;j<=6-i;j++){const k=6-i-j;pts.push([0,1,2].map(d=>(a[d]*i+b[d]*j+c[d]*k)/6).concat(it.name));}};
 const ids=h.indices||[...Array(q.length/3).keys()];
 for(let t=0;t<ids.length;t+=3){const v=n=>[q[ids[t+n]*3],q[ids[t+n]*3+1],q[ids[t+n]*3+2]];const a=v(0),b=v(1),c=v(2);if(Math.max(a[1],b[1],c[1])<2.44)continue;add(a,b,c);if(it.mirror){const m=p=>[-p[0],p[1],p[2]];add(m(a),m(b),m(c));}}}
const P=pts.filter(p=>p[1]>2.46&&p[1]<2.84&&Math.abs(p[0])<0.24&&p[2]>-0.1);
let hdr='  y/x ';for(let x=0;x<=0.22;x+=0.02)hdr+=x.toFixed(2).padStart(6);console.log(hdr);
for(let y=2.82;y>=2.46;y-=0.02){let row=y.toFixed(2)+'  ';for(let x=0;x<=0.22;x+=0.02){const B=P.filter(p=>Math.abs(Math.abs(p[0])-x)<0.01&&Math.abs(p[1]-y)<0.01);row+=(B.length?Math.max(...B.map(p=>p[2])).toFixed(3):'  -  ').padStart(6);}console.log(row);}
const who=new Map();for(const p of P){const k=Math.round(p[1]/0.04)*0.04;const c=who.get(p[3])||[9,0,-9];c[0]=Math.min(c[0],p[1]);c[1]=Math.max(c[1],p[1]);c[2]=Math.max(c[2],p[2]);who.set(p[3],c);}
for(const [n,c] of who)console.log(n,'y',c[0].toFixed(2),c[1].toFixed(2),'zmax',c[2].toFixed(3));
