import {bundle} from '@remotion/bundler';
import {renderStill,renderMedia,selectComposition} from '@remotion/renderer';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {NATIVE_SHAPE_PRESETS} from '../../src/lib/nativeStyle.mjs';

const root=path.resolve(import.meta.dirname,'../..'), out=path.join(root,'verification/native-style/output');
await mkdir(out,{recursive:true});
const sourceHashes={};
for(const file of ['src/TimelineCompositionV2.tsx','src/NativeStyleLayer.tsx','src/lib/nativeStyle.mjs','src/lib/organicText.mjs']) sourceHashes[file]=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
const serveUrl=await bundle({entryPoint:path.join(root,'verification/native-style/entry.tsx')});
const samples=[];
for(const mode of ['board','reaction','comic','narrative']){
  const inputProps={mode},composition=await selectComposition({serveUrl,id:'NativeStyleProbe',inputProps});
  for(const frame of [2,6,30,79]){
    const output=path.join(out,`${mode}-${frame}.png`);
    await renderStill({serveUrl,composition,inputProps,frame,output,imageFormat:'png',logLevel:'error'});
    samples.push({mode,frame,output,sha256:createHash('sha256').update(await readFile(output)).digest('hex')});
  }
  const outputLocation=path.join(out,`${mode}.mp4`);
  await renderMedia({serveUrl,composition,inputProps,outputLocation,codec:'h264',muted:true,crf:18,concurrency:2,logLevel:'error'});
  samples.push({mode,kind:'normal-speed-video-only-renderer-diagnostic',durationMs:2800,fps:30,output:outputLocation,
    sha256:createHash('sha256').update(await readFile(outputLocation)).digest('hex')});
}
const rgb=execFileSync('ffmpeg',['-v','error','-i',path.join(out,'board-30.png'),'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{maxBuffer:1080*1920*3+1000});
const primitivePixels=NATIVE_SHAPE_PRESETS.map((preset,i)=>{
  let count=0;const x=100+i%3*250,y=700+Math.floor(i/3)*90;
  for(let row=y;row<y+70;row++) for(let col=x;col<x+210;col++){
    const p=(row*1080+col)*3,r=rgb[p],g=rgb[p+1],b=rgb[p+2];
    // Translucent subpixel scanlines are real ink too; the blue background has r<g.
    if((r>=g+1&&g>=b+5)||(b>=g+10&&r>=g+1)) count++;
  }
  assert.ok(count>50,`${preset} must paint actual color pixels, found ${count}`);
  return {preset,coloredPixels:count};
});
await writeFile(path.join(out,'manifest.json'),JSON.stringify({schema:'HIOB.NativeStyleRendererDiagnostics.v1',customerFinal:false,sourceHashes,primitivePixels,
  usesSyntheticBackground:true,sourceText:'exact preserved Maru title fixture',directListening:false,samples},null,2));
console.log(JSON.stringify({output:out,samples:samples.length}));
