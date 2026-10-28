import {useEffect,useMemo} from 'react';
import {AbsoluteFill,Sequence,useCurrentFrame,useVideoConfig,delayRender,continueRender,cancelRender} from 'remotion';
import {loadFont as loadNoto} from '@remotion/google-fonts/NotoSansKR';
import {loadFont as loadInter} from '@remotion/google-fonts/Inter';
import {brandedLayerState,verifyBrandedTextMetrics,type BrandedLayer,type BrandedGraphic} from './lib/brandedGraphic.mjs';

function GraphicText({layer}:{layer:BrandedLayer}) {
 const font=layer.fontFamily==='Inter'?loadInter('normal',{weights:['400','500','600','700'],subsets:['latin']}):loadNoto('normal',{weights:['400','500','600','700'],subsets:['korean','latin']});
 const gate=useMemo(()=>delayRender('Verify branded graphic font metrics'),[layer]);
 useEffect(()=>{
  let active=true;
  const verify=async()=>{
   try{
    await font.waitUntilDone();
    const spec=`${layer.fontWeight} ${layer.fontSize}px "${font.fontFamily}"`;
    const faces=await document.fonts.load(spec,layer.text);
    const ctx=document.createElement('canvas').getContext('2d');
    if(!faces.length||!document.fonts.check(spec,layer.text)||!ctx)throw new Error('BRANDED_GRAPHIC_FONT_UNAVAILABLE');
    ctx.font=spec;ctx.letterSpacing='0px';
    verifyBrandedTextMetrics(layer,text=>ctx.measureText(text));
    if(active)continueRender(gate);
   }catch(error){if(active)cancelRender(error instanceof Error?error:new Error(String(error)));}
  };
  void verify();return ()=>{active=false;continueRender(gate);};
 },[layer,font.fontFamily,gate]);
 const m=layer.measurement!;
 return <text x={m.left+1} y={m.ascent+1} fontFamily={font.fontFamily} fontSize={layer.fontSize} fontWeight={layer.fontWeight} fill={layer.fill}>{layer.text}</text>;
}
function Layer({layer,prefix}:{layer:BrandedLayer;prefix:string}) {
 const frame=useCurrentFrame(),{fps}=useVideoConfig(),state=brandedLayerState(layer,frame/fps*1000),b=layer.box;
 const paint=(value:string)=>value.startsWith('gradient:')?`url(#${prefix}-${value.slice(9)})`:value;
 return <svg data-branded-layer={layer.id} width={b.width} height={b.height} viewBox={layer.kind==='text'?`0 0 ${b.width} ${b.height}`:layer.viewBox!.join(' ')} preserveAspectRatio="none"
  style={{position:'absolute',left:b.x+state.dx,top:b.y+state.dy,overflow:'hidden',opacity:state.opacity,clipPath:`inset(0 ${(1-state.reveal)*100}% 0 0)`,pointerEvents:'none'}}>
  {layer.kind==='text'?<GraphicText layer={layer}/>:<>
   <defs>{layer.gradients!.map(g=><linearGradient key={g.id} id={`${prefix}-${g.id}`} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} gradientUnits="userSpaceOnUse">{g.stops.map((s,i)=><stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity}/>)}</linearGradient>)}</defs>
   {layer.primitives!.map((p,i)=>{
    const common={fill:paint(p.fill),stroke:p.stroke,strokeWidth:p.strokeWidth,opacity:p.opacity,strokeLinecap:'round' as const,strokeLinejoin:'round' as const};
    if(p.kind==='path')return <path key={i} {...common} d={p.d as string}/>;
    if(p.kind==='rect')return <rect key={i} {...common} x={p.x as number} y={p.y as number} width={p.width as number} height={p.height as number} rx={p.rx as number}/>;
    return <circle key={i} {...common} cx={p.cx as number} cy={p.cy as number} r={p.r as number}/>;
   })}
  </>}
 </svg>;
}
/** Shared by Studio preview and the pinned final renderer. Never executes imported source. */
export function BrandedGraphicLayer({value,ownerStartMs=0}:{value:BrandedGraphic;ownerStartMs?:number}) {
 const {fps}=useVideoConfig();
 return <AbsoluteFill style={{pointerEvents:'none',background:value.background??undefined}}>{value.layers.map(layer=><Sequence key={layer.id} from={Math.round((ownerStartMs+layer.startMs)/1000*fps)-Math.round(ownerStartMs/1000*fps)} durationInFrames={Math.max(1,Math.round((layer.endMs-layer.startMs)/1000*fps))}>
  <Layer layer={layer} prefix={`${value.source.clipId}-${layer.id}`}/>
 </Sequence>)}</AbsoluteFill>;
}
