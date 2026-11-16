// 飛行型 XS：Tripo の全体寸法（背 1.0）を背 3.0 に換算し、機体エディタ Ver2 の自由部品で組み直す。
// node out/flyingxs/build.mjs out/flyingxs/body.xsunit.json
import fs from 'node:fs';
import { planesFromPoints } from '../../xs-editor/xsasm-lib.js';

const out = process.argv[2];
if (!out) throw new Error('出力先を指定してください');
const ARMOR='#78877f', FRAME='#292e31', EYE='#ff3038', THROAT='#201b18';
const D=Math.PI/180, r6=n=>Math.round(n*1e6)/1e6;
const base=(name,o={})=>({kind:'hull',op:'add',color:ARMOR,mirror:false,bevel:0,bevelSegs:1,bone:'auto',pivot:'auto',team:false,glow:null,metal:.42,rough:.52,noHit:false,noHeight:false,blockout:false,pos:[0,0,0],tf:{p:[0,0,0],r:[0,0,0],s:[1,1,1]},name,...o});
const box=(name,c,s,o={})=>{const [x,y,z]=c,[a,b,d]=s,p=[];for(const X of [-a/2,a/2])for(const Y of [-b/2,b/2])for(const Z of [-d/2,d/2])p.push([x+X,y+Y,z+Z]);return base(name,{planes:planesFromPoints(p),...o});};
const hull=(name,pts,o={})=>base(name,{planes:planesFromPoints(pts),...o});
const lathe=(name,p,prof,o={})=>base(name,{kind:'lathe',pts:prof,segments:12,corner:0,tf:{p,r:[0,0,0],s:[1,1,1]},...o});
const loft=(name,secs,o={})=>base(name,{kind:'loft',secs:secs.map(q=>({n:2.4,...q})),segments:12,steps:1,...o});
const bellows=(name,p,len,r,rot,o={})=>base(name,{kind:'bellows',rings:7,rOut:r,rIn:r*.72,len,bend:0,bendDir:0,ringN:2,ringSteps:2,capA:.025,capB:.025,capR:1,segments:10,tf:{p,r:rot,s:[1,1,1]},color:FRAME,...o});
const P=[];
// 頭：前へ尖る兜と、後ろ上へ反るとさか。溝は左右の斜面へ回す（上から八の字）。
P.push(loft('頭の兜',[{y:2.58,w:.27,f:.25,b:.18,hard:true},{y:2.78,w:.34,f:.33,b:.20},{y:2.94,w:.22,f:.43,b:.24},{y:3,w:.08,f:.34,b:.30,hard:true}],{bone:'head'}));
P.push(hull('頭のとさか',[[0,2.78,-.12],[0,3.02,-.10],[0,3.15,-.38],[0,2.91,-.27],[-.035,2.86,-.14],[.035,2.86,-.14]],{bone:'head'}));
P.push(hull('頭の溝',[[0,2.72,.322],[-.29,2.70,.17],[-.30,2.64,.13],[0,2.64,.285],[.30,2.64,.13],[.29,2.70,.17]],{bone:'head',color:FRAME}));
P.push(lathe('頭のモノアイ',[0,2.687,.326],[[.072,0],[.072,.025],[.052,.045],[0,.05]],{bone:'head',glow:true,color:EYE,tf:{p:[0,2.687,.326],r:[90,0,0],s:[1,1,1]}}));
P.push(box('頭の口',[0,2.55,.27],[.21,.13,.16],{bone:'head',color:FRAME}),box('頭の口の下の縦板',[0,2.43,.20],[.10,.18,.09],{bone:'head'}));
// 胴。胸面は中央を前へ出し、垂直な一枚板にしない。
P.push(loft('胴の胸',[{y:1.72,w:.42,f:.20,b:.17,hard:true},{y:2.12,w:.66,f:.31,b:.21},{y:2.48,w:.54,f:.29,b:.20,hard:true}],{bone:'torso'}));
for(const x of [-.42,.42])P.push(box('胴の胸の横桟通気口',[x,2.14,.295],[.24,.22,.055],{bone:'torso',color:FRAME}),...[-.065,0,.065].map(d=>box('胴の胸の横桟',[x,2.14+d,.333],[.20,.018,.035],{bone:'torso'})));
P.push(hull('胴の胸の五角形板',[[-.25,2.28,.325],[.25,2.28,.325],[.22,2.02,.355],[0,1.78,.36],[-.22,2.02,.355],[-.19,2.08,.27],[.19,2.08,.27]],{bone:'torso'}));
P.push(loft('腰',[{y:1.26,w:.32,f:.16,b:.16,hard:true},{y:1.58,w:.45,f:.21,b:.19},{y:1.76,w:.38,f:.18,b:.18,hard:true}],{bone:'hips'}));
// 胸下から脇へ食い込む動力パイプ。
P.push(bellows('胴の動力パイプ',[-.26,1.83,.08],.42,.055,[0,0,58],{bone:'torso',mirror:true,bend:42}));
// 背中：箱、LWC 台2つ、殻／のどを分離した2噴射口。
P.push(box('背中のランドセル',[0,2.05,-.30],[.64,.72,.30],{bone:'torso'}),box('背中の肩甲骨間のLWC台',[0,2.30,-.49],[.28,.20,.18],{bone:'torso'}),box('背中の腰後ろのLWC台',[0,1.58,-.29],[.30,.19,.18],{bone:'hips'}));
P.push(lathe('背中の噴射口の殻',[-.23,1.82,-.46],[[.13,0],[.16,.10],[.11,.22]],{bone:'torso',mirror:true,tf:{p:[-.23,1.82,-.46],r:[90,0,0],s:[1,1,1]}}),lathe('背中の噴射口ののど',[-.23,1.82,-.49],[[.075,0],[.08,.035]],{bone:'torso',mirror:true,color:THROAT,tf:{p:[-.23,1.82,-.49],r:[90,0,0],s:[1,1,1]}}));
// 肩・腕。各部品を隣へ 2〜5 cm 食い込ませる。
P.push(lathe('肩の丸い装甲',[-.70,2.35,0],[[.36,0],[.40,.14],[.33,.30],[.12,.39],[0,.40]],{bone:'arm',pivot:'arm',mirror:true,tf:{p:[-.70,2.35,0],r:[0,0,90],s:[1,1,1]}}));
P.push(lathe('肩の外の噴射口の殻',[-1.02,2.34,0],[[.13,0],[.16,.12],[.11,.22]],{bone:'arm',mirror:true,tf:{p:[-1.02,2.34,0],r:[0,0,90],s:[1,1,1]}}),lathe('肩の外の噴射口ののど',[-1.08,2.34,0],[[.075,0],[.08,.04]],{bone:'arm',mirror:true,color:THROAT,tf:{p:[-1.08,2.34,0],r:[0,0,90],s:[1,1,1]}}));
P.push(hull('肩の下のとげ',[[-.78,2.12,.02],[-.98,1.92,.02],[-.90,2.20,.15],[-.90,2.20,-.12]],{bone:'arm',mirror:true}));
P.push(loft('上腕',[{y:1.78,w:.18,f:.16,b:.15,hard:true},{y:2.06,w:.24,f:.19,b:.17},{y:2.30,w:.27,f:.20,b:.18,hard:true}],{bone:'arm',mirror:true,tf:{p:[-.68,0,0],r:[0,0,0],s:[1,1,1]}}));
P.push(box('前腕のひじ関節',[-.68,1.72,0],[.23,.19,.24],{bone:'fore',pivot:'fore',mirror:true,color:FRAME}),loft('前腕',[{y:1.12,w:.26,f:.21,b:.19,hard:true},{y:1.47,w:.31,f:.23,b:.21},{y:1.73,w:.25,f:.20,b:.18,hard:true}],{bone:'fore',mirror:true,tf:{p:[-.68,0,0],r:[0,0,0],s:[1,1,1]}}));
P.push(box('手の甲',[-.68,1.04,.03],[.25,.20,.24],{bone:'fore',mirror:true}),lathe('手',[-.68,.94,.04],[[.13,0],[.16,.10],[.12,.20],[0,.25]],{bone:'fore',mirror:true,tf:{p:[-.68,.94,.04],r:[0,0,0],s:[1,1,1]}}));
// 脚。
P.push(lathe('太ももの装甲',[-.29,1.22,0],[[.24,0],[.29,.18],[.27,.48],[.20,.68]],{bone:'leg',mirror:true}),box('すねのひざ関節',[-.29,.77,0],[.30,.24,.28],{bone:'shin',pivot:'shin',mirror:true,color:FRAME}));
P.push(loft('すねの太い装甲',[{y:.12,w:.29,f:.25,b:.23,hard:true},{y:.42,w:.34,f:.28,b:.25},{y:.78,w:.25,f:.22,b:.21,hard:true}],{bone:'shin',mirror:true,tf:{p:[-.29,0,0],r:[0,0,0],s:[1,1,1]}}));
P.push(hull('すね外側の安定翼',[[-.47,.22,-.08],[-.68,.25,-.33],[-.62,.38,-.23],[-.43,.50,-.07],[-.44,.25,.02]],{bone:'shin',mirror:true}));
P.push(lathe('ふくらはぎの噴射口の殻',[-.29,.35,-.27],[[.10,0],[.13,.10],[.09,.19]],{bone:'shin',mirror:true,tf:{p:[-.29,.35,-.27],r:[90,0,0],s:[1,1,1]}}),lathe('ふくらはぎの噴射口ののど',[-.29,.35,-.30],[[.06,0],[.065,.035]],{bone:'shin',mirror:true,color:THROAT,tf:{p:[-.29,.35,-.30],r:[90,0,0],s:[1,1,1]}}));
P.push(hull('足',[[-.48,0,.38],[-.10,0,.38],[-.08,0,-.25],[-.50,0,-.25],[-.44,.18,.30],[-.14,.18,.27],[-.15,.20,-.18],[-.45,.18,-.18]],{bone:'foot',mirror:true}));

for(const p of P)p.role=p.glow?'glow':p.color===FRAME||p.color===THROAT?'frame':'main';
const def={id:'u·flyingxs_body',name:'飛行型 XS の体',cat:'自由な機体',size:[1,1,1],user:true,free:true,half:'free',tab:'upper',pieces:P};
const doc={format:'xs-unit',version:2,name:'飛行型 XS（組み直し 1）',items:[{part:def.id,mov:[0,0,0],rot:[0,0,0],scal:[1,1,1]}],adj:{},paint:{type:'',pal:{main:ARMOR,sub:ARMOR,frame:FRAME,accent:ARMOR,glow:EYE},lock:{},vivid:{colors:[],on:{}}},userParts:{[def.id]:def}};
fs.writeFileSync(out,JSON.stringify(doc));
console.error(`pieces ${P.length}; source scale 3/1; wrote ${out}`);
