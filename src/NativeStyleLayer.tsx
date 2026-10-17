import type * as React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {nativeLayerMotion, type NativeShapeLayer, type NativeTextLayer} from './lib/nativeStyle.mjs';
import {validateOrganicTextLayout} from './lib/organicText.mjs';

/** Asset-free vectors, clipped to the same visible support the shared validator checks. */
export function NativeStyleLayer({layer, children}: {layer: NativeShapeLayer | NativeTextLayer; children?: React.ReactNode}) {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const motion = nativeLayerMotion(layer, frame, fps);
  if (layer.kind === 'text') {
    const box = layer.textStyle;
    // One geometric wipe reveals the whole authored phrase group. No word
    // visibility or source clock is derived from the mask.
    const reveal = Math.min(1, Math.max(0, frame / Math.max(1, box.motion!.entranceMs / 1000 * fps)));
    const bounds=validateOrganicTextLayout(box,{text:layer.sourceText}).bounds,edge=bounds.left+(bounds.right-bounds.left)*reveal;
    const clipPath=layer.mask==='block-reveal'?`polygon(0 0, ${edge}px 0, ${edge}px ${height}px, 0 ${height}px)`:undefined;
    return <div data-native-layer={layer.id} data-native-mask={layer.mask} style={{position:'absolute',inset:0,opacity:layer.opacity,pointerEvents:'none',clipPath}}>
      {children}
    </div>;
  }
  const r = layer.rect, [primary, secondary] = layer.colors;
  const w = r.width * width, h = r.height * height;
  const sx = layer.strokeWidth / w * 50, sy = layer.strokeWidth / h * 50;
  const common = {stroke:secondary,strokeWidth:layer.strokeWidth,vectorEffect:'non-scaling-stroke' as const};
  const content = (() => {
    switch (layer.preset) {
      case 'stamp': return <polygon points={Array.from({length:24},(_,i)=>{const a=i*Math.PI/12-Math.PI/2,d=i%2?36:48;return `${50+Math.cos(a)*d},${50+Math.sin(a)*d}`;}).join(' ')} fill={primary} {...common} />;
      case 'comic-frame': return <rect x={sx} y={sy} width={100-2*sx} height={100-2*sy} fill="none" stroke={primary} strokeWidth={layer.strokeWidth} vectorEffect="non-scaling-stroke" />;
      case 'halftone': return <>{Array.from({length:14},(_,y)=>Array.from({length:20},(_,x)=><circle key={`${x}-${y}`} cx={2.5+x*5} cy={3.5+y*7} r={.65+(x%4)*.2} fill={primary} />))}</>;
      case 'ink': return <><polygon points="3,18 18,9 85,4 95,21 99,77 84,92 12,98 1,73" fill={primary} {...common}/><path d="M12 24L85 14M18 88L91 79" stroke={secondary} strokeWidth={2} vectorEffect="non-scaling-stroke" /></>;
      case 'rule': return <path d="M0 50H100" stroke={primary} strokeWidth={layer.strokeWidth} vectorEffect="non-scaling-stroke" />;
      case 'paper': return <><polygon points="0,4 9,0 18,5 27,1 36,6 45,0 54,4 63,1 72,5 81,0 90,4 100,0 100,96 90,100 81,95 72,99 63,94 54,100 45,96 36,99 27,95 18,100 9,96 0,100" fill={primary}/><path d="M5 25H95M5 50H95M5 75H95" stroke={secondary} strokeWidth={1} opacity={.25} vectorEffect="non-scaling-stroke"/></>;
      case 'tape': return <><polygon points="2,0 98,0 94,14 100,28 95,42 100,57 94,71 100,86 96,100 1,100 6,85 0,70 5,56 0,42 6,28 0,15" fill={primary}/>{Array.from({length:12},(_,i)=><path key={i} d={`M${i*10-20} 0l25 100`} stroke={secondary} strokeWidth={1} opacity={.25} vectorEffect="non-scaling-stroke"/>)}</>;
      case 'scanline': return <>{Array.from({length:25},(_,i)=><rect key={i} x={0} y={i*4} width={100} height={1} fill={i%3?primary:secondary} opacity={.35}/>)}</>;
      case 'glitch-bars': return <>{Array.from({length:7},(_,i)=><rect key={i} x={(frame*3+i*13)%32} y={i*14} width={35+(i%3)*12} height={4+i%2*4} fill={i%2?primary:secondary}/>)}</>;
      case 'sparkle': return <>{[[23,28,17],[71,56,23],[33,82,10]].map(([x,y,size],i)=>{const d=size*(.7+.3*Math.sin(frame*.2+i)**2);return <path key={i} d={`M${x} ${y-d}Q${x+2} ${y-2} ${x+d} ${y}Q${x+2} ${y+2} ${x} ${y+d}Q${x-2} ${y+2} ${x-d} ${y}Q${x-2} ${y-2} ${x} ${y-d}`} fill={i%2?secondary:primary}/>;})}</>;
      case 'grid': return <>{Array.from({length:11},(_,i)=><path key={i} d={`M${i*10} 0V100M0 ${i*10}H100`} stroke={i%2?secondary:primary} strokeWidth={1} opacity={.5} vectorEffect="non-scaling-stroke"/>)}</>;
      case 'arrow': return <polygon points="0,38 65,38 65,8 100,50 65,92 65,62 0,62" fill={primary}/>;
    }
  })();
  return <svg aria-hidden data-native-layer={layer.id} data-native-preset={layer.preset} viewBox="0 0 100 100" preserveAspectRatio="none"
    style={{position:'absolute',left:r.x*width,top:r.y*height,width:w,height:h,overflow:'hidden',pointerEvents:'none',opacity:motion.opacity,
      clipPath:`inset(0 ${(1-motion.reveal)*100}% 0 0)`}}>
    <g transform={`translate(${motion.translateX*100} 0) translate(50 50) scale(${motion.scale}) translate(-50 -50)`}>{content}</g>
  </svg>;
}
