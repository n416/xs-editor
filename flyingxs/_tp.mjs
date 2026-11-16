import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildHull } from 'file:///C:/Users/nakam/ex-online/xs-editor/hull.js';
function geometryOnlyGlb(buf){const n=buf.readUInt32LE(12),json=JSON.parse(buf.subarray(20,20+n).toString('utf8'));delete json.images;delete json.textures;delete json.samplers;for(const m of json.materials??[]){for(const k of['normalTexture','occlusionTexture','emissiveTexture'])delete m[k];if(m.pbrMetallicRoughness)for(const k of['baseColorTexture','metallicRoughnessTexture'])delete m.pbrMetallicRoughness[k];delete m.extensions;}delete json.extensionsUsed;delete json.extensionsRequired;const rest=buf.subarray(20+n);let js=Buffer.from(JSON.stringify(json));js=Buffer.concat([js,Buffer.alloc((4-js.length%4)%4,0x20)]);const h=Buffer.alloc(20);h.writeUInt32LE(0x46546c67,0);h.writeUInt32LE(2,4);h.writeUInt32LE(20+js.length+rest.length,8);h.writeUInt32LE(js.length,12);h.writeUInt32LE(0x4e4f534a,16);return Buffer.concat([h,js,rest]);}
const b=geometryOnlyGlb(fs.readFileSync('C:/Users/nakam/ex-online/out/flyingxs/flying-xs-body.glb'));
const gltf=await new Promise((ok,no)=>new GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',ok,no));
gltf.scene.updateMatrixWorld(true);const raw=[];
gltf.scene.traverse(o=>{if(!o.isMesh||/lod[12]$/i.test(o.name))return;const p=o.geometry.attributes.position,v=new THREE.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);raw.push([v.x,v.y,-v.z]);}});
const box={min:[1e9,1e9,1e9],max:[-1e9,-1e9,-1e9]};for(const p of raw)for(let d=0;d<3;d++){box.min[d]=Math.min(box.min[d],p[d]);box.max[d]=Math.max(box.max[d],p[d]);}
const S=3/(box.max[1]-box.min[1]),cx=(box.min[0]+box.max[0])/2,cz=(box.min[2]+box.max[2])/2;
const T=raw.map(p=>[(p[0]-cx)*S,(p[1]-box.min[1])*S,(p[2]-cz)*S]);
console.log('--- TRIPO flipped (front +z), |x|<0.12, occupied y intervals');
const F=T.map(p=>[p[0],p[1],-p[2]]);
const pick=(P,keyF,cmp)=>{const m=new Map();for(const p of P){const k=keyF(p);const q=m.get(k);if(!q||cmp(p,q))m.set(k,p);}return [...m.values()];};
const ext=P=>{const r=[];const b=0.02;
 r.push(...pick(P,p=>Math.round(p[1]/b)+','+Math.round(p[2]/b),(a,c)=>a[0]>c[0]),...pick(P,p=>Math.round(p[1]/b)+','+Math.round(p[2]/b),(a,c)=>a[0]<c[0]));
 r.push(...pick(P,p=>Math.round(p[0]/b)+','+Math.round(p[2]/b),(a,c)=>a[1]>c[1]),...pick(P,p=>Math.round(p[0]/b)+','+Math.round(p[2]/b),(a,c)=>a[1]<c[1]));
 r.push(...pick(P,p=>Math.round(p[0]/b)+','+Math.round(p[1]/b),(a,c)=>a[2]>c[2]),...pick(P,p=>Math.round(p[0]/b)+','+Math.round(p[1]/b),(a,c)=>a[2]<c[2]));
 return [...new Set(r)];};
const helm=F.filter(p=>p[1]>2.775&&Math.abs(p[0])<0.25&&p[2]>-0.22&&p[2]<0.30);
const skull=F.filter(p=>p[1]>2.64&&p[1]<2.80&&Math.abs(p[0])<0.14&&p[2]>-0.215&&p[2]<-0.06);
const { planesFromPoints } = await import('file:///C:/Users/nakam/ex-online/xs-editor/xsasm-lib.js');
for (const [n,P] of [['helm',helm],['skull',skull]]) {const R=ext(P);const pl=planesFromPoints(R,1e-7);const h=buildHull(pl,{});
 const bb=[0,1,2].map(d=>[Math.min(...P.map(p=>p[d])).toFixed(3),Math.max(...P.map(p=>p[d])).toFixed(3)]);
 console.log(n,'pts',P.length,'rep',R.length,'planes',pl.length,'tris',h.positions.length/9,'bbox',JSON.stringify(bb));
 fs.writeFileSync(process.env.S+'/'+n+'.json',JSON.stringify(R.map(p=>p.map(v=>Math.round(v*1000)/1000))));}
