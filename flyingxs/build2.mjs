// Tripo の表面頂点を部位ごとに分け、局所的な凸包（結晶）へ変換する。
//   node out/flyingxs/build2.mjs out/flyingxs/body2.xsunit.json
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { planesFromPoints } from '../../xs-editor/xsasm-lib.js';
import { buildHull } from '../../xs-editor/hull.js';

const input = new URL('./flying-xs-body.glb', import.meta.url);
const output = process.argv[2];
if (!output) throw new Error('出力先を指定してください');
const ARMOR = '#68756f', ARMOR2 = '#596762', FRAME = '#292e31', THROAT = '#3a2720', EYE = '#ff3030';
const round = n => Math.round(n * 1e6) / 1e6;
const block = (name, o = {}) => ({ kind:'hull', op:'add', color:ARMOR, mirror:false, bevel:0, bevelSegs:1,
  bone:'auto', pivot:'auto', team:false, glow:null, metal:.42, rough:.62, noHit:false, noHeight:false,
  blockout:false, pos:[0,0,0], tf:{p:[0,0,0],r:[0,0,0],s:[1,1,1]}, name, ...o });

// Node で GLB を読むため、画像参照を外す（形の頂点だけを使う）。
function geometryOnlyGlb(buf) {
  const n = buf.readUInt32LE(12), json = JSON.parse(buf.subarray(20, 20+n).toString('utf8'));
  delete json.images; delete json.textures; delete json.samplers;
  for (const m of json.materials ?? []) {
    for (const k of ['normalTexture','occlusionTexture','emissiveTexture']) delete m[k];
    if (m.pbrMetallicRoughness) for (const k of ['baseColorTexture','metallicRoughnessTexture']) delete m.pbrMetallicRoughness[k];
    delete m.extensions;
  }
  delete json.extensionsUsed; delete json.extensionsRequired;
  const rest = buf.subarray(20+n); let js = Buffer.from(JSON.stringify(json));
  js = Buffer.concat([js, Buffer.alloc((4-js.length%4)%4, 0x20)]);
  const h = Buffer.alloc(20); h.writeUInt32LE(0x46546c67,0); h.writeUInt32LE(2,4);
  h.writeUInt32LE(20+js.length+rest.length,8); h.writeUInt32LE(js.length,12); h.writeUInt32LE(0x4e4f534a,16);
  return Buffer.concat([h,js,rest]);
}
async function loadPoints() {
  const b = geometryOnlyGlb(fs.readFileSync(input));
  const ab = b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
  const gltf = await new Promise((ok,no) => new GLTFLoader().parse(ab,'',ok,no));
  gltf.scene.updateMatrixWorld(true); const raw=[];
  gltf.scene.traverse(o => {
    if (!o.isMesh || /lod[12]$/i.test(o.name)) return;
    const p=o.geometry.attributes.position, v=new THREE.Vector3();
    for(let i=0;i<p.count;i++){ v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld); raw.push([v.x,v.y,-v.z]); }
  });
  const box={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(const p of raw) for(let d=0;d<3;d++){box.min[d]=Math.min(box.min[d],p[d]);box.max[d]=Math.max(box.max[d],p[d]);}
  const S=3/(box.max[1]-box.min[1]), cx=(box.min[0]+box.max[0])/2, cz=(box.min[2]+box.max[2])/2;
  const seen=new Set(), pts=[];
  for(const p of raw){const q=[(p[0]-cx)*S,(p[1]-box.min[1])*S,(p[2]-cz)*S];const k=q.map(v=>Math.round(v*350)).join(',');if(!seen.has(k)){seen.add(k);pts.push(q);}}
  return {pts, sourceVertices:raw.length, uniqueVertices:pts.length, sourceBox:box};
}

const sq=(a,b,w=[1,1,1])=>w.reduce((s,x,i)=>s+x*(a[i]-b[i])**2,0);
function kmeans(points,k,weight=[1,1,1]){
  if(points.length<8) return [points];
  const c=[points.reduce((a,p)=>sq(p,[0,0,0],weight)>sq(a,[0,0,0],weight)?p:a,points[0])];
  while(c.length<k){let best=points[0],bd=-1;for(const p of points){const d=Math.min(...c.map(q=>sq(p,q,weight)));if(d>bd){bd=d;best=p;}}c.push(best);}
  let groups=[];
  for(let it=0;it<12;it++){
    groups=Array.from({length:k},()=>[]);for(const p of points){let bi=0,bd=Infinity;c.forEach((q,i)=>{const d=sq(p,q,weight);if(d<bd){bd=d;bi=i;}});groups[bi].push(p);}
    groups.forEach((g,i)=>{if(g.length)c[i]=[0,1,2].map(d=>g.reduce((s,p)=>s+p[d],0)/g.length);});
  }
  return groups.filter(g=>g.length>=8);
}
// 密な表面から、各方向の端と遠い点を残す。凸包の面数を抑えつつ元の輪郭を保つ。
function representatives(points,limit=18){
  const dirs=[];for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)if(x||y||z)dirs.push([x,y,z]);
  const out=[];for(const d of dirs){let q=points[0],v=-Infinity;for(const p of points){const n=p[0]*d[0]+p[1]*d[1]+p[2]*d[2];if(n>v){v=n;q=p;}}if(!out.includes(q))out.push(q);}
  while(out.length>limit)out.splice(out.length-2,1); return out;
}
function crystal(name,points,o={}){
  const rp=representatives(points,o.limit??18), planes=planesFromPoints(rp,2e-5);
  const h=buildHull(planes,{reach:6}); if(h.positions.length<12) return null;
  return block(name,{planes:planes.map(p=>p.map(round)),smooth:24,...o,limit:undefined});
}

const {pts,sourceVertices,uniqueVertices,sourceBox}=await loadPoints();
const left=pts.filter(p=>p[0]<=.018), ax=p=>Math.abs(p[0]);
const regions=[
  ['頭',p=>p[1]>2.54&&ax(p)<.42,8,'head',[1.2,1,1]],
  ['胴',p=>p[1]>1.72&&p[1]<=2.55&&ax(p)<.58,12,'torso',[1,1.15,1]],
  ['腰',p=>p[1]>1.43&&p[1]<=1.82&&ax(p)<.52,6,'hips',[1,1.2,1]],
  ['肩',p=>p[1]>2.12&&p[1]<=2.55&&ax(p)>=.46,6,'arm',[1,1,1]],
  ['上腕',p=>p[1]>1.70&&p[1]<=2.22&&ax(p)>=.48,5,'arm',[1,1.15,1]],
  ['前腕',p=>p[1]>1.08&&p[1]<=1.76&&ax(p)>=.48,6,'fore',[1,1.15,1]],
  ['手',p=>p[1]>.78&&p[1]<=1.16&&ax(p)>=.46,4,'fore',[1,1.1,1]],
  ['太もも',p=>p[1]>.88&&p[1]<=1.52&&ax(p)<.58,7,'leg',[1,1.2,1]],
  ['すね',p=>p[1]>.24&&p[1]<=.94&&ax(p)<.60,9,'shin',[1,1.15,1]],
  ['足',p=>p[1]<=.30&&ax(p)<.64,5,'foot',[1,1,1.15]],
  ['背中',p=>p[1]>1.55&&p[1]<2.48&&ax(p)<.58&&p[2]<-.18,5,'torso',[1,1,1.2]],
];
const P=[], counts={};
for(const [name,test,k,bone,w] of regions){const found=left.filter(test), gs=kmeans(found,k,w);counts[name]=0;gs.forEach((g,i)=>{const q=crystal(`${name}の塊 ${i+1}`,g,{bone,mirror:true});if(q){P.push(q);counts[name]++;}});}

const hull=(name,points,o={})=>block(name,{planes:planesFromPoints(points).map(p=>p.map(round)),...o});
const box=(name,c,s,o={})=>hull(name,[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>[c[0]+x*s[0]/2,c[1]+y*s[1]/2,c[2]+z*s[2]/2]))),o);
const lathe=(name,at,profile,o={})=>block(name,{kind:'lathe',pts:profile,segments:o.segments??12,corner:0,tf:{p:at,r:o.r??[0,0,0],s:[1,1,1]},...o,segments:o.segments??12,r:undefined});
// 印1・2：兜の張り出しと反ったとさか。溝とレンズは丸みに沿う三分割で、正面一枚の平面にしない。
P.push(hull('頭の前へ尖る兜',[[-.34,2.53,.20],[0,2.55,.43],[-.28,2.72,.24],[0,2.82,.28],[-.31,2.66,-.02],[0,2.75,-.05]],{bone:'head',mirror:true}),
  hull('頭の後ろ上へ反るとさか',[[-.18,2.70,-.12],[0,2.72,-.16],[-.14,3.08,-.10],[0,3.12,-.12],[-.12,2.91,.18],[0,2.93,.20]],{bone:'head',mirror:true}),
  box('口',[0,2.51,.255],[.19,.11,.12],{bone:'head',color:FRAME}),box('口の下の縦板',[0,2.40,.22],[.10,.16,.07],{bone:'head',color:FRAME}));
const groove=[
  {x0:-.045,x1:0,z0:.315,z1:.330},{x0:-.125,x1:-.04,z0:.286,z1:.320},{x0:-.215,x1:-.12,z0:.225,z1:.292}
];
for(const [i,g] of groove.entries())P.push(hull(`頭の溝 ${i+1}`,[[g.x0,2.585,g.z0],[g.x1,2.585,g.z1],[g.x0,2.655,g.z0-.015],[g.x1,2.655,g.z1-.015],[g.x0,2.595,g.z0-.025],[g.x1,2.595,g.z1-.025]],{bone:'head',mirror:i>0,color:FRAME}),
  hull(`頭のモノアイ ${i+1}`,[[g.x0,2.607,g.z0+.008],[g.x1,2.607,g.z1+.008],[g.x0,2.638,g.z0],[g.x1,2.638,g.z1],[g.x0,2.610,g.z0+.022],[g.x1,2.610,g.z1+.022]],{bone:'head',mirror:i>0,color:EYE,glow:true,metal:0,rough:.25}));
// 印3：胸の横桟と中央の五角板。
for(const x of [-.39,-.31,-.23])P.push(box('胴の胸の通気口の横桟',[x,2.12,.37],[.075,.028,.045],{bone:'torso',mirror:true,color:FRAME}));
P.push(hull('胴の胸中央の五角形の板',[[0,2.22,.39],[-.23,2.18,.36],[-.27,1.91,.34],[0,1.76,.38],[0,2.22,.47],[-.23,2.18,.44],[-.27,1.91,.42],[0,1.76,.46]],{bone:'torso',mirror:true,color:ARMOR2}));
// 印4：胸下から脇へ食い込む蛇腹。
P.push(block('胴の胸下から脇への動力パイプ',{kind:'bellows',bone:'torso',mirror:true,color:FRAME,rings:8,rOut:.075,rIn:.052,len:.58,bend:72,bendDir:90,ringN:2,ringSteps:3,capA:.03,capB:.03,capR:1.1,segments:10,tf:{p:[-.22,1.79,.25],r:[0,0,64],s:[1,1,1]}}));
// 印5：肩の外筒と下のとげ。元の肩結晶へ付け根を深く重ねる。
P.push(lathe('肩の外の噴射口の殻',[-.92,2.30,.01],[[.18,0],[.20,.10],[.16,.25],[.10,.31]],{bone:'arm',mirror:true,r:[0,0,90]}),lathe('肩の外の噴射口ののど',[-1.03,2.30,.01],[[.09,0],[.095,.08]],{bone:'arm',mirror:true,r:[0,0,90],color:THROAT}),
  hull('肩の下のとげ',[[-.64,2.17,.03],[-.94,1.91,-.01],[-.84,2.21,.18],[-.84,2.21,-.15]],{bone:'arm',mirror:true}));
// 印6・8：すねの後ろ向き外ひれ、ふくらはぎ噴射口。
P.push(hull('すね外側の後ろへ伸びるひれ',[[-.43,.25,-.10],[-.70,.23,-.43],[-.62,.42,-.31],[-.41,.54,-.09],[-.44,.24,.02]],{bone:'shin',mirror:true}),
  lathe('すねのふくらはぎ噴射口の殻',[-.29,.43,-.29],[[.11,0],[.14,.11],[.09,.20]],{bone:'shin',mirror:true,r:[90,0,0]}),lathe('すねのふくらはぎ噴射口ののど',[-.29,.43,-.35],[[.062,0],[.068,.07]],{bone:'shin',mirror:true,r:[90,0,0],color:THROAT}));
// 印7：ランドセル、LWC 台、二重の噴射口。
P.push(box('背中のランドセル',[0,2.05,-.39],[.70,.78,.27],{bone:'torso',color:ARMOR2}),
  box('背中のLWCを受ける台',[-.24,2.40,-.54],[.18,.22,.16],{bone:'torso',mirror:true,color:FRAME}),
  lathe('背中の噴射口の殻',[-.24,1.76,-.51],[[.13,0],[.16,.12],[.10,.23]],{bone:'torso',mirror:true,r:[90,0,0]}),lathe('背中の噴射口ののど',[-.24,1.72,-.57],[[.075,0],[.08,.08]],{bone:'torso',mirror:true,r:[90,0,0],color:THROAT}));
// 印9：拳。元メッシュの手の塊に重ねる。部品名は指定された二語だけ。
P.push(hull('手',[[-.79,.87,.16],[-.57,.87,.17],[-.52,1.09,.11],[-.82,1.08,.10],[-.77,.86,-.13],[-.58,.86,-.12],[-.55,1.08,-.08],[-.80,1.08,-.07]],{bone:'fore',mirror:true,color:FRAME}),
  hull('手の甲',[[-.82,.98,.12],[-.54,.98,.13],[-.57,1.16,.10],[-.80,1.16,.09],[-.79,.98,-.02],[-.57,.98,-.01]],{bone:'fore',mirror:true}));

for(const p of P){delete p.limit;p.role=p.glow?'glow':(p.color===FRAME||p.color===THROAT?'frame':'main');}
const def={id:'u·flyingxs_body2',name:'飛行型 XS の体 2',cat:'自由な機体',size:[1,1,1],user:true,free:true,half:'free',tab:'upper',pieces:P};
const doc={format:'xs-unit',version:2,name:'飛行型 XS（Tripo 頂点の塊）',items:[{part:def.id,mov:[0,0,0],rot:[0,0,0],scal:[1,1,1]}],adj:{},paint:{type:'',pal:{main:ARMOR,sub:ARMOR2,frame:FRAME,accent:ARMOR2,glow:EYE},lock:{},vivid:{colors:[],on:{}}},userParts:{[def.id]:def}};
fs.writeFileSync(output,JSON.stringify(doc));
const tris=P.reduce((s,p)=>s+(p.kind==='hull'?buildHull(p.planes,{reach:6}).positions.length/9:(p.kind==='lathe'?(p.pts.length-1)*p.segments*2:p.kind==='bellows'?p.rings*p.segments*4:0))*(p.mirror?2:1),0);
console.error(JSON.stringify({sourceVertices,uniqueVertices,sourceBox,crystals:counts,pieces:P.length,estimatedTriangles:Math.round(tris),output}));
