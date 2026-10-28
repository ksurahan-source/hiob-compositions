import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBrandedGraphic,brandedLayerState,verifyBrandedTextMetrics} from '../lib/brandedGraphic.mjs';
import {assertNativeMetaSafeZone} from '../lib/nativeMetaSafeZone.mjs';
const clip={id:'clip-1',startMs:100,durationMs:2000,trackKind:'video',assetKind:'video',url:'https://example.com/approved.mp4'};
const make=()=>({contract:'branded-graphic-v1',source:{clipId:clip.id,sha256:'a'.repeat(64),templateSha256:'b'.repeat(64),approvedTexts:['산카']},background:null,safeArea:{left:65,top:269,right:1015,bottom:1248},protectedRegions:[],layers:[{id:'label',kind:'text',startMs:0,endMs:1800,box:{x:100,y:400,width:92,height:42},keyframes:[{atMs:0,dx:0,dy:20,opacity:0,reveal:0},{atMs:300,dx:0,dy:0,opacity:1,reveal:1}],text:'산카',fontFamily:'Noto Sans KR',fontSize:40,fontWeight:500,fill:'#472CF5',measurement:{left:0,right:90,ascent:35,descent:5,advance:90}}]});
test('shared validator and safety admission accept bound layers without claiming video observation',()=>{const value=make();assert.equal(validateBrandedGraphic(value,{clip}).layers,1);assert.equal(assertNativeMetaSafeZone({clips:[{...clip,attributes:{branded_graphic_v1:value}}]}).finalVideoObserved,false);});
test('every motion endpoint, protection window, text and parent binding fail closed',()=>{
 for(const mutate of [v=>v.source.clipId='other',v=>v.layers[0].text='수정 문구',v=>v.layers[0].keyframes[0].dy=900,v=>v.layers[0].fill='url(https://evil)',v=>v.layers[0].endMs=2001,v=>v.layers[0].measurement.right=900,v=>v.safeArea={left:0,top:0,right:1080,bottom:1920}&&void(v.layers[0].box.y=50),v=>v.protectedRegions.push({x:100,y:420,width:100,height:50,startMs:200,endMs:800})]) {
  const value=make();mutate(value);assert.throws(()=>validateBrandedGraphic(value,{clip}),/BRANDED_GRAPHIC_INVALID|Invalid/);
 }
});
test('rounded frame containment and simultaneous caption occupancy are enforced',()=>{
 const value=make();value.layers[0].box={x:100,y:400,width:92,height:42};
 assert.throws(()=>validateBrandedGraphic(value,{clip,clips:[{id:'caption',trackKind:'caption',startMs:0,durationMs:2000,textContent:'original',attributes:{text_style:{bounds:{left:100,top:420,width:300,height:50}}}}]}),/existing captions/);
 value.layers[0].startMs=1999;value.layers[0].endMs=2000;value.layers[0].keyframes=[{atMs:0,dx:0,dy:0,opacity:1,reveal:1}];assert.throws(()=>validateBrandedGraphic(value,{clip}),/Rounded/);
});
test('cubic interpolation is deterministic and font metrics reject fallback',()=>{
 const layer=make().layers[0];assert.deepEqual(brandedLayerState(layer,0),layer.keyframes[0]);assert.equal(brandedLayerState(layer,150).opacity,.875);assert.equal(brandedLayerState(layer,800).dy,0);
 const measure=()=>({actualBoundingBoxLeft:0,actualBoundingBoxRight:90,actualBoundingBoxAscent:35,actualBoundingBoxDescent:5,width:90});verifyBrandedTextMetrics(layer,measure);assert.throws(()=>verifyBrandedTextMetrics(layer,()=>({...measure(),width:100})),/metrics changed/);
});
test('untrusted vector input never accepts arbitrary attributes, resources or path expressions',()=>{
 const value=make();value.layers=[{id:'logo',kind:'vector',startMs:0,endMs:1800,box:{x:96,y:300,width:260,height:42},keyframes:[{atMs:0,dx:0,dy:0,opacity:1,reveal:1}],viewBox:[0,0,118,19],gradients:[],primitives:[{kind:'path',d:'M0 0L118 19Z',fill:'#123456',stroke:'none',strokeWidth:0,opacity:1}]}];
 validateBrandedGraphic(value,{clip});for(const patch of [{onclick:'evil'},{fill:'url(https://evil)'},{d:'M0 0 javascript:evil'},{d:'M0 0L1e999 5'},{kind:'image',href:'https://evil'}]){const v=structuredClone(value);Object.assign(v.layers[0].primitives[0],patch);assert.throws(()=>validateBrandedGraphic(v,{clip}),/BRANDED_GRAPHIC_INVALID/);}
});

test('full graphic background cannot hide protected source content or bind to an audio owner',()=>{
 const value=make();value.background='#FAFAF8';value.protectedRegions.push({x:800,y:800,width:20,height:20,startMs:0,endMs:1000});assert.throws(()=>validateBrandedGraphic(value,{clip}),/opaque graphic background/);
 assert.throws(()=>validateBrandedGraphic(make(),{clip:{...clip,trackKind:'audio'}}),/visual track/);
});

test('client cannot erase authoritative observed content from the owning clip or timeline',()=>{
 const observation={x:100,y:400,width:100,height:80,id:'face'};
 const owner={...clip,attributes:{organic_text_v1:{protected_regions:[observation]}}};
 assert.throws(()=>validateBrandedGraphic(make(),{clip:owner}),/observed content/);
 assert.throws(()=>validateBrandedGraphic(make(),{clip,clips:[owner]}),/observed content/);
 const value=make();value.background='#FAFAF8';observation.x=900;observation.y=1000;assert.throws(()=>validateBrandedGraphic(value,{clip,clips:[owner]}),/opaque graphic background/);
});

test('opaque backgrounds require asset-less owners and no simultaneous source media',()=>{
 const value=make();value.background='#FAFAF8';assert.throws(()=>validateBrandedGraphic(value,{clip}),/empty visual owner/);
 const empty={...clip,url:undefined,assetKind:undefined};validateBrandedGraphic(value,{clip:empty});
 const other={...clip,id:'other',startMs:1800};assert.throws(()=>validateBrandedGraphic(value,{clip:empty,clips:[other]}),/overlapping source media/);
 validateBrandedGraphic(value,{clip:empty,clips:[{...other,startMs:2100}]});
});

test('background and primary captions cannot bypass overlap through millisecond rounding',()=>{
 const owner={id:'clip-1',trackKind:'video',startMs:17,durationMs:17};
 const value=make();value.background='#FAFAF8';value.layers[0].startMs=0;value.layers[0].endMs=17;value.layers[0].keyframes=[{atMs:0,dx:0,dy:0,opacity:1,reveal:1}];
 const media={id:'other',trackKind:'video',url:'https://example.com/source.mp4',startMs:34,durationMs:1000};
 assert.throws(()=>validateBrandedGraphic(value,{clip:owner,clips:[media],fps:30}),/overlapping source media/);
 value.background=null;const caption={...media,trackKind:'caption',textContent:'원문',attributes:{text_style:{bounds:{left:100,top:400,width:100,height:50}}}};assert.throws(()=>validateBrandedGraphic(value,{clip:owner,clips:[caption],fps:30}),/existing captions/);
});
