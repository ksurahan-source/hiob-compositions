import {resolveMetaSafeArea} from './meta-safe-zone.mjs';

export const BRANDED_GRAPHIC_CONTRACT='branded-graphic-v1';
const fail=message=>{throw Object.assign(new Error(`BRANDED_GRAPHIC_INVALID: ${message}`),{code:'BRANDED_GRAPHIC_INVALID'});};
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const number=(n,min,max)=>finite(n)&&n>=min&&n<=max;
const id=s=>typeof s==='string'&&/^[\w:.-]{1,120}$/u.test(s);
const sha=s=>typeof s==='string'&&/^[a-f0-9]{64}$/u.test(s);
const color=s=>typeof s==='string'&&(s==='none'||/^#[a-f\d]{6}(?:[a-f\d]{2})?$/iu.test(s));
function keys(o,required,optional=[]) {
 if(!o||typeof o!=='object'||Array.isArray(o)||required.some(k=>!(k in o))||Object.keys(o).some(k=>![...required,...optional].includes(k)))fail('Unsupported or missing field.');
}
const start=c=>c.startMs??c.start_ms;
const duration=c=>c.durationMs??c.duration_ms;
const clipFrames=(clip,fps)=>({from:Math.round(start(clip)/1000*fps),length:Math.max(1,Math.round(duration(clip)/1000*fps))});
const sharesFrames=(a,b)=>a.from<b.from+b.length&&a.from+a.length>b.from;
const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
export function brandedLayerState(layer,ms) {
 const k=layer.keyframes;
 const next=k.findIndex(p=>p.atMs>=ms);
 if(next<0)return k[k.length-1];
 if(next===0)return k[0];
 const a=k[next-1],b=k[next],t=1-(1-Math.max(0,Math.min(1,(ms-a.atMs)/(b.atMs-a.atMs))))**3;
 return Object.fromEntries(['dx','dy','opacity','reveal'].map(key=>[key,a[key]+(b[key]-a[key])*t]));
}
export function verifyBrandedTextMetrics(layer,measure) {
 const actual=measure(layer.text);
 const m=layer.measurement;
 for(const [key,field] of [['left','actualBoundingBoxLeft'],['right','actualBoundingBoxRight'],['ascent','actualBoundingBoxAscent'],['descent','actualBoundingBoxDescent'],['advance','width']]) {
  if(!finite(actual[field])||Math.abs(actual[field]-m[key])>1)fail('The exact authored font metrics changed. Reimport using the loaded font.');
 }
}
/** Pure JSON only; clipping bounds include every keyframe and all interpolated motion. */
export function validateBrandedGraphic(value,{clip,width=1080,height=1920,fps=30,clips=[],tracks=[]}={}) {
 if((JSON.stringify(value)?.length??0)>400000)fail('Graphic exceeds the supported document size.');
 keys(value,['contract','source','background','safeArea','protectedRegions','layers']);
 keys(value.source,['clipId','sha256','templateSha256','approvedTexts']);
 if(value.contract!==BRANDED_GRAPHIC_CONTRACT||!clip||value.source.clipId!==clip.id||!sha(value.source.sha256)||!sha(value.source.templateSha256)||
  !number(start(clip),0,3600000)||!Number.isInteger(start(clip))||!number(duration(clip),1,1200000)||!Number.isInteger(duration(clip))||width!==1080||height!==1920||!number(fps,1,120))fail('Source clip, SHA, canvas and original clock are required.');
 if(!Array.isArray(value.source.approvedTexts)||value.source.approvedTexts.length>100||value.source.approvedTexts.some(s=>typeof s!=='string'||!s.trim()||s.length>500||/[\u0000-\u001f]/u.test(s)))fail('Exact approved labels are required.');
 if(value.background!==null&&!color(value.background))fail('Background must be a literal color.');
 keys(value.safeArea,['left','top','right','bottom']);
 const safe=resolveMetaSafeArea(value.safeArea,{width,height});
 const ownerKind=clip.trackKind??tracks.find(t=>t.id===clip.track_id)?.kind;
 if(ownerKind!==undefined&&!['video','overlay'].includes(ownerKind))fail('Graphic owners must use a visual track.');
 if(!Array.isArray(value.layers)||!value.layers.length||value.layers.length>100||!Array.isArray(value.protectedRegions)||value.protectedRegions.length>100)fail('Layer or protection count exceeded.');
 const protectedRegions=[...value.protectedRegions,...[...clips,clip].flatMap(c=>(c.attributes?.organic_text_v1?.protected_regions??[]).map(p=>({x:p.x,y:p.y,width:p.width,height:p.height,startMs:p.startMs??start(c),endMs:p.endMs??start(c)+duration(c)})))];
 for(const p of protectedRegions){keys(p,['x','y','width','height','startMs','endMs']);if(!number(p.x,0,width)||!number(p.y,0,height)||!number(p.width,1,width)||!number(p.height,1,height)||!number(p.startMs,0,3600000)||!number(p.endMs,p.startMs+1,3600000))fail('Invalid protected observation.');}
 const ownerFrames=clipFrames(clip,fps);
 if(value.background!==null&&protectedRegions.some(p=>Math.ceil(p.startMs/1000*fps)<ownerFrames.from+ownerFrames.length&&Math.ceil(p.endMs/1000*fps)>ownerFrames.from))fail('An opaque graphic background would hide protected source content.');
 const hidden=new Set(tracks.filter(t=>t.visible===false).map(t=>t.id));
 const hasMedia=c=>Boolean(c.artifact_id||c.assetId||c.artifactId||c.url);
 const visual=c=>['video','image','overlay'].includes(c.trackKind??c.kind??tracks.find(t=>t.id===c.track_id)?.kind)||['image','video'].includes(c.assetKind);
 if(value.background!==null&&(hasMedia(clip)||clips.some(c=>c.id!==clip.id&&!hidden.has(c.track_id)&&visual(c)&&hasMedia(c)&&sharesFrames(clipFrames(c,fps),ownerFrames))))fail('Opaque graphic backgrounds require an empty visual owner without overlapping source media.');
 const occupied=clips.filter(c=>!hidden.has(c.track_id)&&['title','caption'].includes(c.trackKind??tracks.find(t=>t.id===c.track_id)?.kind)&&String(c.textContent??c.text_content??'').trim()&&sharesFrames(clipFrames(c,fps),ownerFrames)).map(c=>{
  const b=c.attributes?.text_style?.bounds;
  if(!b||!['left','top','width','height'].every(k=>finite(b[k]))||b.width<=0||b.height<=0)fail('Measure existing primary captions before placing branded graphics.');
  const frames=clipFrames(c,fps);
  return {x:b.left,y:b.top,width:b.width,height:b.height,startMs:frames.from/fps*1000,endMs:(frames.from+frames.length)/fps*1000};
 });
 const seen=new Set();
 for(const layer of value.layers) {
  const common=['id','kind','startMs','endMs','box','keyframes'];
  keys(layer,[...common,...(layer.kind==='text'?['text','fontFamily','fontSize','fontWeight','fill','measurement']:['viewBox','primitives','gradients'])]);
  if(!id(layer.id)||seen.has(layer.id)||!['text','vector'].includes(layer.kind)||!Number.isInteger(layer.startMs)||!Number.isInteger(layer.endMs)||!number(layer.startMs,0,duration(clip)-1)||!number(layer.endMs,layer.startMs+1,duration(clip)))fail('Invalid layer identity or time.');seen.add(layer.id);
  const roundedStart=Math.round((start(clip)+layer.startMs)/1000*fps),roundedLength=Math.max(1,Math.round((layer.endMs-layer.startMs)/1000*fps));
  if(roundedStart+roundedLength>Math.round(start(clip)/1000*fps)+Math.max(1,Math.round(duration(clip)/1000*fps)))fail('Rounded layer frames exceed the owner clock.');
  keys(layer.box,['x','y','width','height']);
  if(!number(layer.box.x,-width,width)||!number(layer.box.y,-height,height)||!number(layer.box.width,1,width)||!number(layer.box.height,1,height))fail('Invalid layer bounds.');
  if(!Array.isArray(layer.keyframes)||!layer.keyframes.length||layer.keyframes.length>180)fail('One to 180 bounded keyframes required.');
  let prior=-1;
  for(const k of layer.keyframes){keys(k,['atMs','dx','dy','opacity','reveal']);if(!Number.isInteger(k.atMs)||!number(k.atMs,0,layer.endMs-layer.startMs)||k.atMs<=prior||!number(k.dx,-width,width)||!number(k.dy,-height,height)||!number(k.opacity,0,1)||!number(k.reveal,0,1))fail('Invalid motion keyframe.');prior=k.atMs;}
  if(layer.keyframes[0].atMs!==0)fail('Motion must start at zero.');
  if(layer.kind==='text') {
   if(!value.source.approvedTexts.includes(layer.text)||!['Noto Sans KR','Inter'].includes(layer.fontFamily)||!number(layer.fontSize,12,160)||![400,500,600,700].includes(layer.fontWeight)||!color(layer.fill))fail('Use exact approved text and supported measured fonts.');
   keys(layer.measurement,['left','right','ascent','descent','advance']);
   const m=layer.measurement;
   if(Object.values(m).some(n=>!finite(n))||!number(m.advance,1,width)||!number(m.ascent,-192,192)||!number(m.descent,-192,192)||m.ascent+m.descent<=0||m.left+m.right<=0||layer.box.width<m.left+m.right+2||layer.box.height<m.ascent+m.descent+2)fail('Actual-font ink bounds and a two-pixel guard are required.');
  }else{
   if(!Array.isArray(layer.viewBox)||layer.viewBox.length!==4||layer.viewBox.some(n=>!finite(n))||!number(layer.viewBox[2],1,20000)||!number(layer.viewBox[3],1,20000)||!Array.isArray(layer.primitives)||!layer.primitives.length||layer.primitives.length>100||!Array.isArray(layer.gradients)||layer.gradients.length>8)fail('Bounded vector geometry required.');
   const gradients=new Set();
   for(const g of layer.gradients){keys(g,['id','x1','y1','x2','y2','stops']);if(!id(g.id)||gradients.has(g.id)||['x1','y1','x2','y2'].some(k=>!number(g[k],-20000,20000))||!Array.isArray(g.stops)||g.stops.length>12||!g.stops.length)fail('Invalid gradient.');gradients.add(g.id);for(const s of g.stops){keys(s,['offset','color','opacity']);if(!number(s.offset,0,1)||!color(s.color)||!number(s.opacity,0,1))fail('Invalid gradient stop.');}}
   const paint=s=>color(s)||(typeof s==='string'&&s.startsWith('gradient:')&&gradients.has(s.slice(9)));
   for(const p of layer.primitives){
    const geometry=p.kind==='path'?['d']:p.kind==='rect'?['x','y','width','height','rx']:p.kind==='circle'?['cx','cy','r']:[];
    if(!geometry.length)fail('Unsupported vector primitive.');
    keys(p,['kind',...geometry,'fill','stroke','strokeWidth','opacity']);
    if(!paint(p.fill)||!color(p.stroke)||!number(p.strokeWidth,0,16)||!number(p.opacity,0,1))fail('Vector paints must be literal colors or local gradients.');
    if(p.kind==='path'){if(typeof p.d!=='string'||p.d.length>30000||!/^[MmLlHhVvCcSsQqTtAaZz\d\s,\.eE+\-]+$/u.test(p.d)||!/[Mm]/u.test(p.d)||p.d.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/giu)?.some(n=>!number(Number(n),-20000,20000)))fail('Invalid path.');}
    else if(geometry.some(k=>!number(p[k],-20000,20000))||(p.kind==='rect'&&(p.width<=0||p.height<=0||p.rx<0))||(p.kind==='circle'&&p.r<=0))fail('Invalid primitive geometry.');
   }
  }
  // Cubic easing never overshoots either endpoint; their union encloses the whole motion.
  for(const k of layer.keyframes){const b={...layer.box,x:layer.box.x+k.dx,y:layer.box.y+k.dy};if(b.x<safe.left||b.y<safe.top||b.x+b.width>safe.right||b.y+b.height>safe.bottom)fail('Animated layer crosses the enforced Meta safe zone.');}
  const xs=layer.keyframes.map(k=>k.dx),ys=layer.keyframes.map(k=>k.dy);
  const swept={x:layer.box.x+Math.min(...xs),y:layer.box.y+Math.min(...ys),width:layer.box.width+Math.max(...xs)-Math.min(...xs),height:layer.box.height+Math.max(...ys)-Math.min(...ys)};
  const begin=roundedStart/fps*1000,end=(roundedStart+roundedLength)/fps*1000;
  if([...protectedRegions,...occupied].some(p=>p.startMs<end&&p.endMs>begin&&overlaps(swept,p)))fail('Animated layer overlaps observed content or existing captions.');
 }
 return {valid:true,layers:value.layers.length,finalVideoObserved:false};
}
