/**
 * ShapeElementRenderer — skeleton shape renderer (rect/circle/line/triangle/star).
 *
 * Phase 0: rect + circle via CSS. triangle/star/line are placeholders.
 */
import type * as React from 'react';
import type { ShapeElement } from '@hiob/timeline/schema';
import type { ElementRendererFn } from './index';
import { applyAnimations, defaultElementRendererRegistry } from './index';

const ShapeElementRenderer: ElementRendererFn<ShapeElement> = ({
  element: el,
  fps,
  frame,
  animationRegistry,
}) => {
  const anim = applyAnimations(el, frame, fps, animationRegistry);
  const opacity = anim.opacity !== undefined ? anim.opacity * (el.opacity ?? 1) : (el.opacity ?? 1);
  const scale = anim.scale ?? 1;
  const tx = (anim.x ?? 0) + (el.x ?? 0);
  const ty = (anim.y ?? 0) + (el.y ?? 0);
  const rotation = (anim.rotation ?? 0) + (el.rotation ?? 0);

  const fill = el.fill
    ? el.fill.type === 'solid' ? el.fill.color : 'transparent'
    : 'transparent';

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${tx}%`,
    top: `${ty}%`,
    width: `${el.width}%`,
    height: `${el.height}%`,
    opacity,
    transform: `scale(${scale}) rotate(${rotation}deg)`,
    zIndex: el.zIndex ?? 0,
    backgroundColor: fill,
    ...(el.stroke ? { border: `${el.stroke.width}px solid ${el.stroke.color}` } : {}),
    ...(el.borderRadius !== undefined ? { borderRadius: `${el.borderRadius}px` } : {}),
  };

  if (el.shapeType === 'circle') {
    baseStyle.borderRadius = '50%';
  }

  // TODO: triangle, star, line — Phase 1 via SVG
  if (el.shapeType === 'triangle' || el.shapeType === 'star' || el.shapeType === 'line') {
    return null;
  }

  return <div style={baseStyle} />;
};

defaultElementRendererRegistry.register('shape', ShapeElementRenderer);

export default ShapeElementRenderer;
