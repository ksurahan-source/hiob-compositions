/**
 * VideoElementRenderer — pure, deterministic video/image element renderer.
 *
 * Handles animation via the AnimationRegistry + property keyframe evaluation.
 * No side effects, no async, no randomness — safe for preview == render parity.
 */
import { OffthreadVideo, Img } from 'remotion';
import type * as React from 'react';
import type { VideoElement } from '@hiob/timeline/schema';
import type { ElementRendererFn } from './index';
import { applyAnimations } from './index';
import { defaultElementRendererRegistry } from './index';

function isImageUrl(src: string): boolean {
  return /\.(jpe?g|png|gif|webp|avif|svg)(\?|#|$)/i.test(src);
}

const VideoElementRenderer: ElementRendererFn<VideoElement> = ({
  element: el,
  fps,
  frame,
  animationRegistry,
}) => {
  const baseScale = el.scale ?? 1;
  const baseX = el.x ?? 0;
  const baseY = el.y ?? 0;
  const baseOpacity = el.opacity ?? 1;
  const baseRotation = ('rotation' in el ? (el as any).rotation : 0) ?? 0;

  const anim = applyAnimations(el, frame, fps, animationRegistry);

  const scale = (anim.scale ?? 1) * baseScale;
  const tx = (anim.x ?? 0) + baseX;
  const ty = (anim.y ?? 0) + baseY;
  const opacity = anim.opacity !== undefined ? anim.opacity * baseOpacity : baseOpacity;
  const rotation = (anim.rotation ?? 0) + baseRotation;

  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${tx}%`,
    top: `${ty}%`,
    width: `${el.width}%`,
    height: `${el.height}%`,
    opacity,
    transform: `scale(${scale}) rotate(${rotation}deg)`,
    zIndex: el.zIndex ?? 0,
    objectFit: (el.fit ?? 'cover') as React.CSSProperties['objectFit'],
  };

  if (isImageUrl(el.src)) {
    return <Img src={el.src} style={style} />;
  }

  return (
    <OffthreadVideo
      src={el.src}
      style={style}
      startFrom={Math.round(((el.startFrom ?? 0) / 1000) * fps)}
      muted={el.muted ?? false}
      volume={el.volume ?? 1}
      loop={el.loop ?? false}
    />
  );
};

defaultElementRendererRegistry.register('video', VideoElementRenderer);

export default VideoElementRenderer;
