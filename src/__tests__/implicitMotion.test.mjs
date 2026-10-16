import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import React from 'react';
import * as remotion from 'remotion';

const entry=fileURLToPath(new URL('../TimelineCompositionV2.tsx',import.meta.url));
let currentFrame=0;
const cache=new Map();
// Execute the actual composition and its local helpers, substituting only the
// Remotion frame context and network font loading. No rendering logic is copied.
function load(file) {
  if(cache.has(file))return cache.get(file).exports;
  const module={exports:{}};
  cache.set(file,module);
  const require=createRequire(file);
  const source=fs.readFileSync(file,'utf8')+(file===entry?'\nexports.clipUnderTest = ClipRenderer;':'');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,
    jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
  const mockedRequire=(name)=>{
    if(name==='react')return {...React,useContext:context=>context._currentValue};
    if(name==='remotion')return {...remotion,useCurrentFrame:()=>currentFrame,
      useVideoConfig:()=>({fps:30,width:1080,height:1920,durationInFrames:75})};
    if(name.startsWith('@remotion/google-fonts/'))return {loadFont:()=>({fontFamily:'Test font'})};
    if(name==='@remotion/gif')return {Gif:'gif'};
    const local=name.startsWith('.')?path.resolve(path.dirname(file),name):null;
    const resolved=local?[local,local+'.ts',local+'.tsx',local+'.mjs',path.join(local,'index.ts')]
      .find(candidate=>fs.existsSync(candidate)&&fs.statSync(candidate).isFile()):require.resolve(name);
    if(!resolved)throw new Error('Cannot resolve '+name+' from '+file);
    if(/\.(?:tsx?|mjs)$/.test(resolved))return load(resolved);
    return require(name);
  };
  vm.runInNewContext(code,{module,exports:module.exports,require:mockedRequire,console,
    __filename:file,__dirname:path.dirname(file)},{filename:file});
  return module.exports;
}
const {clipUnderTest}=load(entry);
const base={id:'unanimated-personless-cut',trackKind:'video',assetKind:'image',
  url:'fixture.png',startMs:0,durationMs:2500,transforms:{x:0,y:0,scale:1,rotation:0,opacity:1},
  effects:[],keyframes:[],attributes:{}};
function style(clip,frame) {
  currentFrame=frame;
  return clipUnderTest({clip,mix:{voice:1,music:.15,sfx:.6},proofCutawayWindows:[],voiceWindows:[]}).props.style;
}
for(const [label,patch] of [
  ['image without animation',{}],
  ['video without animation',{assetKind:'video',url:'fixture.mp4'}],
  ['cover framing',{attributes:{fit:'cover'}}],
  ['contain framing',{attributes:{fit:'contain'}}],
  ['manual crop',{transforms:{...base.transforms,scale:1.42,y:-.42}}],
  ['subshot framing',{attributes:{subshot_count:3,subshot_index:1},transforms:{...base.transforms,scale:1.2}}],
  ['hook visual',{attributes:{scene_type:'hook'}}],
  ['rotation keyframe only',{keyframes:[{property:'rotation',timeMs:0,value:5}]}],
  ['opacity keyframe only',{keyframes:[{property:'opacity',timeMs:0,value:.8}]}],
])test(label+' has no implicit spatial motion',()=>{
  const clip={...base,...patch},first=style(clip,0);
  for(const frame of [1,7,15,36,38,39,47,74]){
    assert.equal(style(clip,frame).transform,first.transform,`unexpected movement at frame ${frame}`);
    assert.equal(style(clip,frame).opacity,first.opacity,`unexpected entrance at frame ${frame}`);
  }
});
test('explicit scale keyframes still animate',()=>{
  const clip={...base,keyframes:[{property:'scale',timeMs:0,value:1},{property:'scale',timeMs:2500,value:1.2}]};
  assert.notEqual(style(clip,0).transform,style(clip,39).transform);
});
for(const kind of ['ken-burns','zoom-in','zoom-out'])test('explicit '+kind+' still animates',()=>{
  const clip={...base,effects:[{kind,params:{}}]};
  assert.notEqual(style(clip,0).transform,style(clip,39).transform);
});
