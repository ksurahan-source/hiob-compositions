import {bundle} from '@remotion/bundler';
import {renderStill,selectComposition} from '@remotion/renderer';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(import.meta.dirname,'output','text-mask');
await mkdir(out,{recursive:true});
const serveUrl=await bundle({entryPoint:path.join(root,'verification/native-style/entry.tsx')});
const results=[];
for(const frame of [3,12,30]){
 const counts={};
 for(const disableMask of [true,false]){
  const inputProps={mode:'narrative',disableMask},composition=await selectComposition({serveUrl,id:'NativeStyleProbe',inputProps});
  const output=path.join(out,`${disableMask?'unmasked':'masked'}-${frame}.png`);
  await renderStill({serveUrl,composition,inputProps,frame,output,imageFormat:'png',logLevel:'error'});
  const rgb=execFileSync('ffmpeg',['-v','error','-i',output,'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{maxBuffer:1080*1920*3+1000});
  let glyphPixels=0;
  for(let y=500;y<810;y++)for(let x=380;x<700;x++){const i=(y*1080+x)*3,r=rgb[i],g=rgb[i+1],b=rgb[i+2];if(Math.min(r,g,b)>50&&Math.max(r,g,b)-Math.min(r,g,b)<35)glyphPixels++;}
  counts[disableMask?'unmasked':'masked']=glyphPixels;
 }
 assert.ok(counts.unmasked>50,'Actual phrase glyphs must paint in the control.');
 if(frame===3)assert.ok(counts.masked<counts.unmasked*.8,'Whole-phrase mask must change actual glyph visibility during entrance.');
 else assert.equal(counts.masked,counts.unmasked,'Mask must fully release the unchanged complete phrase during hold.');
 results.push({frame,...counts});
}
await writeFile(path.join(out,'report.json'),JSON.stringify({scope:'actual PNG glyph-mask diagnostic, not customer final',passed:true,results},null,2));
console.log(JSON.stringify(results));
