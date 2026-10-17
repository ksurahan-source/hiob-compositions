import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {TimelineCompositionV2} from '../../src/TimelineCompositionV2';
import {validateOrganicTextLayout} from '../../src/lib/organicText.mjs';
import {NATIVE_SHAPE_PRESETS} from '../../src/lib/nativeStyle.mjs';
import fixtures from '../organic-paint/fixtures.json';

const shape = (preset:string,id:string,x:number,y:number,width:number,height:number,entrance='wipe',zIndex=1) => ({id,kind:'shape',preset,
  rect:{x:x/1080,y:y/1920,width:width/1080,height:height/1920},startMs:0,endMs:2800,zIndex,opacity:1,
  colors:['#FFCF45','#652CCA'],strokeWidth:4,motion:{entrance,entranceMs:240,exit:'fade',exitMs:200}});
const Probe = ({mode,disableMask=false}:{mode:string;disableMask?:boolean}) => {
  const source=structuredClone(fixtures.clips[0]);
  const textStyle={...structuredClone(source.attributes.text_style),x:432,y:550,width:176,
    entrance:mode==='narrative'?'slide-in':'pop',emphasisSpans:[],fill:undefined};
  delete textStyle.fill;
  textStyle.bounds=validateOrganicTextLayout(textStyle,{text:source.textContent}).bounds;
  const textLayer={id:'exact-approved-phrase',kind:'text',sourceClipId:source.id,sourceText:source.textContent,textStyle,
    mask:mode==='narrative'&&!disableMask?'block-reveal':'none',zIndex:8,opacity:1,startMs:0,endMs:2800};
  const layers=mode==='board'
    ? NATIVE_SHAPE_PRESETS.map((p,i)=>shape(p,p,100+i%3*250,700+Math.floor(i/3)*90,210,70,'stamp'))
    : mode==='reaction'
      ? [shape('stamp','reaction-vector',410,550,220,200,'stamp'),textLayer]
      : mode==='comic'
        ? [shape('halftone','comic-dots',410,530,220,300),shape('comic-frame','comic-border',410,530,220,300,'wipe',2),shape('ink','comic-ink',420,550,200,200,'wipe',3),textLayer]
        : [shape('rule','narrative-rule',410,805,220,8,'wipe'),textLayer];
  const owner={id:'diagnostic-owner',startMs:0,durationMs:2800,zIndex:0,trackKind:'video',assetKind:'image',
    url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" fill="#172537"/><circle cx="840" cy="290" r="120" fill="#23364e"/></svg>'),
    attributes:{native_style:{contract:'native-style-v1',styleId:mode==='board'?'comic':mode,version:1,
      observationId:'diagnostic-no-person-or-product',safeArea:source.attributes.text_style.safeArea,protectedRegions:[],layers}}};
  return <TimelineCompositionV2 {...{fps:30,width:1080,height:1920,aspect:'9:16',durationMs:2800,clips:[owner,source],mix:{voice:1,music:.15,sfx:.6}} as any}/>;
};
registerRoot(()=> <Composition id="NativeStyleProbe" component={Probe} defaultProps={{mode:'board'}} width={1080} height={1920} fps={30} durationInFrames={84}/>);
