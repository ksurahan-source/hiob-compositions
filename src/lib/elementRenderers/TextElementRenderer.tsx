/**
 * TextElementRenderer — pure, locale-aware text element renderer.
 *
 * Consumes LocaleConfigContext for font fallback and line-break strategy.
 * Applies property keyframe animations deterministically.
 * Supports {variable} interpolation via the `variables` prop.
 */
import type * as React from 'react';
import { useContext } from 'react';
import type { TextElement } from '@hiob/timeline/schema';
import type { ElementRendererFn } from './index';
import { applyAnimations, defaultElementRendererRegistry } from './index';
import { LocaleConfigContext } from '../ReelDocCanvas';
import { resolveBrandVar } from '../brandVarResolver';

const TextElementRenderer: ElementRendererFn<TextElement> = ({
  element: el,
  fps,
  frame,
  brandKit,
  localeConfig,
  animationRegistry,
  variables = {},
}) => {
  // Consume locale config from context (for font fallback chain)
  const ctxLocale = useContext(LocaleConfigContext);
  const effective = localeConfig ?? ctxLocale;

  // {variable} substitution
  let text = el.text ?? '';
  for (const [k, v] of Object.entries(variables)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }

  const baseOpacity = el.opacity ?? 1;
  const anim = applyAnimations(el, frame, fps, animationRegistry);
  const opacity = anim.opacity !== undefined ? anim.opacity * baseOpacity : baseOpacity;
  const scale = anim.scale ?? 1;
  const tx = (anim.x ?? 0) + (el.x ?? 0);
  const ty = (anim.y ?? 0) + (el.y ?? 0);
  const rotation = anim.rotation ?? 0;

  const resolvedColor = resolveBrandVar(el.color, 'color', brandKit);
  const resolvedFontFamily = resolveBrandVar(el.fontFamily, 'font', brandKit);
  const resolvedBg = el.backgroundColor
    ? resolveBrandVar(el.backgroundColor, 'color', brandKit)
    : undefined;

  const fontFamily = resolvedFontFamily
    ? `${resolvedFontFamily}, ${effective.captionFontFallback}`
    : effective.captionFontFallback;

  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${tx}%`,
    top: `${ty}%`,
    width: `${el.width}%`,
    ...(el.height !== undefined ? { height: `${el.height}%` } : {}),
    fontSize: `${el.fontSize}px`,
    fontFamily,
    fontWeight: el.fontWeight ?? '400',
    color: resolvedColor,
    textAlign: el.textAlign ?? 'center',
    ...(el.lineHeight !== undefined ? { lineHeight: el.lineHeight } : {}),
    ...(el.letterSpacing !== undefined ? { letterSpacing: `${el.letterSpacing}px` } : {}),
    ...(el.textDecoration ? { textDecoration: el.textDecoration } : {}),
    ...(resolvedBg ? {
      backgroundColor: resolvedBg,
      padding: `${el.padding ?? 8}px`,
      borderRadius: `${el.borderRadius ?? 4}px`,
    } : {}),
    opacity,
    transform: `scale(${scale}) rotate(${rotation}deg)`,
    zIndex: el.zIndex ?? 0,
    ...(el.blur ? { filter: `blur(${el.blurAmount ?? 3}px)` } : {}),
  };

  return <div style={style}>{text}</div>;
};

defaultElementRendererRegistry.register('text', TextElementRenderer);

export default TextElementRenderer;
