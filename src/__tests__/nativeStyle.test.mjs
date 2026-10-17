import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNativeStyle,nativeShapeBounds,nativeLayerMotion,NATIVE_SHAPE_PRESETS} from '../lib/nativeStyle.mjs';
import {authorOrganicTextLayout} from '../lib/organicText.mjs';

const owner = {id:'shot',trackKind:'video',startMs:1000,durationMs:3000};
const safeArea = {left:90,top:270,right:918,bottom:1248};
const shape = (patch={}) => ({id:'graphic',kind:'shape',preset:'stamp',rect:{x:.1,y:.2,width:.2,height:.1},
  startMs:0,endMs:2000,zIndex:1,opacity:1,colors:['#FFD65C','#111111'],strokeWidth:3,
  motion:{entrance:'stamp',entranceMs:200,exit:'fade',exitMs:150},...patch});
const style = layers => ({contract:'native-style-v1',version:1,styleId:'reaction',observationId:'actual-frame-observation',safeArea,protectedRegions:[],layers});
const context = {clip:owner,clips:[owner],fps:30,width:1080,height:1920};
const measured = (patch={}) => authorOrganicTextLayout({layoutVersion:'organic-v2',text:'승인된 구절',kind:'caption',
  font:{fontFamily:'Black Han Sans',fontWeight:400},measureText:(t,size)=>[...t].length*size*.8,measurementId:'explicit-test-metrics',
  safeArea,startMs:1000,durationMs:2000,fps:30,fontSizes:[48],widths:[400],placements:[{x:110,y:850,align:'left'}],entrance:'none',
  motion:{entranceMs:200,intensity:0,settle:0,exit:'none',exitMs:0},palette:{base:'#FFFFFF',accent:'#FFD65C',contrast:'#BFA6FF',alert:'#FF6B82'},semanticSpans:[],...patch});

test('all twelve vector presets have validated actual render supports and bounded deterministic motion',()=>{
  for(const preset of NATIVE_SHAPE_PRESETS){
    const layer=shape({preset});assert.equal(validateNativeStyle(style([layer]),context).valid,true);
    assert.ok(nativeShapeBounds(layer).every(r=>r.left>=90&&r.top>=270&&r.right<=918&&r.bottom<=1248));
    for(let f=0;f<60;f++){const a=nativeLayerMotion(layer,f,30);assert.deepEqual(a,nativeLayerMotion(layer,f,30));assert.ok(a.scale<=1&&a.scale>0);assert.ok(a.opacity<=1&&a.opacity>=0);}
  }
});
test('shape fails closed for unknown keys, unsafe geometry, unsupported paint and invalid local clocks',()=>{
  for(const patch of [{preset:'raw-svg'},{markup:'<svg/>'},{rect:{x:0,y:0,width:.2,height:.1}},{colors:['url(http://bad)','#111111']},
    {startMs:100,endMs:100},{endMs:3001},{startMs:.5},{opacity:NaN},{motion:{entrance:'stamp',entranceMs:0,exit:'none',exitMs:0}}]){
    assert.throws(()=>validateNativeStyle(style([shape(patch)]),context));
  }
  assert.throws(()=>validateNativeStyle({...style([shape()]),observationId:''},context));
  assert.throws(()=>validateNativeStyle(style([shape(),shape()]),context));
});
test('hollow comic frame leaves observed face interior clear while strokes still collide',()=>{
  const frame=shape({preset:'comic-frame',rect:{x:.1,y:.2,width:.6,height:.4}});
  const input=style([frame]); input.protectedRegions=[{x:300,y:500,width:250,height:250,startMs:1000,endMs:3000}];
  assert.equal(validateNativeStyle(input,context).valid,true);
  input.protectedRegions[0].x=108;
  assert.throws(()=>validateNativeStyle(input,context),{code:'NATIVE_STYLE_PROTECTED_OVERLAP'});
  assert.equal(nativeLayerMotion(frame,1,30).scale,1);assert.equal(nativeLayerMotion(frame,1,30).translateX,0);
});
test('protection uses global rounded frame presentation, including a short fractional boundary window',()=>{
  const input=style([shape()]);input.protectedRegions=[{x:120,y:390,width:20,height:20,startMs:1020,endMs:1025}];
  assert.equal(validateNativeStyle(input,context).valid,true); // No presented frame falls in this window.
  input.protectedRegions[0].endMs=1040;
  assert.throws(()=>validateNativeStyle(input,context),{code:'NATIVE_STYLE_PROTECTED_OVERLAP'});
});
test('a nominal millisecond fit may not spill one rounded output frame beyond its owner',()=>{
  const clip={...owner,startMs:0,durationMs:34};
  const layer=shape({startMs:17,endMs:34,motion:{entrance:'none',entranceMs:0,exit:'none',exitMs:0}});
  assert.throws(()=>validateNativeStyle(style([layer]),{...context,clip}),{code:'NATIVE_STYLE_INVALID'});
});
test('independent text retains exact approved source phrase and original display clock',()=>{
  const source={id:'caption',trackKind:'caption',textContent:'문장 전체 승인된 구절',startMs:1000,durationMs:2500,
    attributes:{text_style:measured({text:'문장 전체 승인된 구절',lineGroups:['문장 전체','승인된 구절'],durationMs:2500,placements:[{x:110,y:1030,align:'left'}]})}};
  const layer={id:'reaction',kind:'text',sourceClipId:'caption',sourceText:'승인된 구절',textStyle:measured(),mask:'block-reveal',startMs:0,endMs:2000,zIndex:2,opacity:1};
  const ctx={...context,clips:[owner,source]};assert.equal(validateNativeStyle(style([layer]),ctx).valid,true);
  for(const patch of [{sourceText:'새로운 대사'},{sourceClipId:'missing'},{endMs:2600},{mask:'word-reveal'},
    {textStyle:{...layer.textStyle,startMs:1001}},{textStyle:{...layer.textStyle,parentFrames:[]}},
    {textStyle:{...layer.textStyle,strokeColor:'url(https://external)'}},{textStyle:{...layer.textStyle,shadow:{...layer.textStyle.shadow,color:'rgba(1,2,3)'}}},
    {textStyle:{...layer.textStyle,unknownStyle:'bad'}}]) assert.throws(()=>validateNativeStyle(style([{...layer,...patch}]),ctx));
  assert.equal(source.textContent,'문장 전체 승인된 구절');
  assert.throws(()=>validateNativeStyle(style([{...layer,sourceText:'승인된',textStyle:measured({text:'승인된'})}]),ctx),{code:'NATIVE_STYLE_SOURCE_MISMATCH'});
  assert.throws(()=>validateNativeStyle(style([layer,{...layer,id:'second-line'}]),ctx),{code:'NATIVE_STYLE_SOURCE_MISMATCH'});
  const sibling={...owner,id:'another-owner',attributes:{native_style:style([{...layer,sourceText:'문장 전체'}])}};
  assert.throws(()=>validateNativeStyle(style([layer]),{...ctx,clips:[...ctx.clips,sibling]}),{code:'NATIVE_STYLE_SOURCE_MISMATCH'});
});
test('unmeasured legacy, UGC and manual primary text fail closed only during simultaneous frames',()=>{
  for(const text_profile of ['ugc-v3','legacy','manual']) {
    const caption={id:'legacy-caption',trackKind:'caption',textContent:'기존 승인 자막',startMs:0,durationMs:3000,attributes:{text_profile}};
    const layer=shape({preset:'paper',rect:{x:102/1080,y:970/1920,width:804/1080,height:217/1920}});
    assert.throws(()=>validateNativeStyle(style([layer]),{...context,clips:[owner,caption]}),{code:'NATIVE_STYLE_OCCUPIED_UNMEASURED'});
    assert.equal(validateNativeStyle(style([layer]),{...context,clips:[owner,{...caption,durationMs:500}]}).valid,true);
  }
});
test('new shapes and measured text cannot cover an existing primary caption',()=>{
  const source={id:'caption',trackKind:'caption',textContent:'승인된 구절',startMs:1000,durationMs:2000,attributes:{text_style:measured()}};
  const ctx={...context,clips:[owner,source]};
  assert.throws(()=>validateNativeStyle(style([shape({rect:{x:.11,y:.45,width:.3,height:.1}})]),ctx),{code:'NATIVE_STYLE_TEXT_OVERLAP'});
  const layer={id:'reaction',kind:'text',sourceClipId:'caption',sourceText:'승인된 구절',textStyle:measured(),mask:'none',startMs:0,endMs:2000,zIndex:2,opacity:1};
  assert.throws(()=>validateNativeStyle(style([layer]),ctx),{code:'ORGANIC_TEXT_PROTECTED_OVERLAP'});
});
