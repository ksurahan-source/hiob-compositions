/**
 * Element Renderer Registry — extensible dispatcher for ReelDoc element types.
 *
 * Each element type (video, text, shape, audio, composition) registers a
 * pure renderer function. ReelDocCanvas dispatches to the right renderer
 * without hard-coded branching. New element types require no core changes.
 */
import type * as React from 'react';
import type { Element } from '@hiob/timeline/schema';
import type { LocaleConfig } from '../../localeConfig';
import type { AnimationRegistry, AnimationTransform } from '../animationRegistry';
import { getEasing } from '../easing';

export interface RendererProps<T extends Element = Element> {
  element: T;
  fps: number;
  /** Absolute frame (for elements that receive composition frame). */
  frame: number;
  durationMs: number;
  brandKit?: import('@hiob/timeline/schema').BrandKit;
  localeConfig: LocaleConfig;
  animationRegistry: AnimationRegistry;
  /** Template variable overrides, e.g. {product.name}. */
  variables?: Record<string, unknown>;
}

export type ElementRendererFn<T extends Element = Element> = (
  props: RendererProps<T>,
) => React.ReactElement | null;

type RendererMap = Partial<Record<Element['type'], ElementRendererFn<any>>>;

export class ElementRendererRegistry {
  private renderers: RendererMap = {};

  register<T extends Element>(type: T['type'], fn: ElementRendererFn<T>): void {
    this.renderers[type] = fn;
  }

  get<T extends Element>(type: T['type']): ElementRendererFn<T> | null {
    return (this.renderers[type] as ElementRendererFn<T>) ?? null;
  }
}

export const defaultElementRendererRegistry = new ElementRendererRegistry();

// ── Keyframe interpolation helper ──────────────────────────────────────────────

interface KfPoint {
  time: number; // 0–100 percent through animation
  [key: string]: unknown;
}

export function evaluateKfProperty(
  keyframes: KfPoint[],
  atPercent: number,
  property: string,
  fallbackEasing?: string,
): number | undefined {
  if (!keyframes.length) return undefined;

  let before = keyframes[0];
  let after = keyframes[keyframes.length - 1];

  for (let i = 0; i < keyframes.length - 1; i++) {
    if (keyframes[i].time <= atPercent && keyframes[i + 1].time >= atPercent) {
      before = keyframes[i];
      after = keyframes[i + 1];
      break;
    }
  }

  const bv = before[property];
  const av = after[property];
  if (typeof bv !== 'number' || typeof av !== 'number') return undefined;
  if (before.time === after.time) return bv;

  const progress = (atPercent - before.time) / (after.time - before.time);
  // Per-keyframe easing (outgoing segment) → parent easing → linear. Computed
  // manually (not Remotion interpolate) so overshoot curves (ease-out-back) can
  // sail PAST the target value and settle — the anticipation that reads as "손맛".
  const eased = getEasing((before.easing as string) ?? fallbackEasing)(progress);
  return bv + eased * (av - bv);
}

/** Apply an element's animations[] to a base transform state. Pure, deterministic. */
export function applyAnimations(
  element: Element,
  frame: number,
  fps: number,
  registry: AnimationRegistry,
): AnimationTransform {
  const result: AnimationTransform = {};
  const anims = ('animations' in element ? element.animations : undefined) ?? [];

  for (const anim of anims) {
    const animStartFrame = Math.round((anim.startTime / 1000) * fps);
    const animDurFrames = Math.max(1, Math.round((anim.duration / 1000) * fps));
    if (frame < animStartFrame || frame > animStartFrame + animDurFrames) continue;

    const frameInAnim = frame - animStartFrame;
    const progressPct = Math.max(0, Math.min(100, (frameInAnim / animDurFrames) * 100));

    // Named-preset reference → resolve from the AnimationRegistry (ken-burns,
    // snap-zoom-in, overshoot-pop, …). This is the bridge that makes the registry
    // reachable from a declarative ReelDoc, not just hand-authored keyframes.
    if (anim.type === 'preset') {
      const fn = registry.getPreset(anim.presetId);
      if (fn) {
        const t = fn(frameInAnim, fps, animDurFrames, (anim as { intensity?: string }).intensity);
        if (t.scale !== undefined) result.scale = t.scale;
        if (t.x !== undefined) result.x = t.x;
        if (t.y !== undefined) result.y = t.y;
        if (t.opacity !== undefined) result.opacity = t.opacity;
        if (t.rotation !== undefined) result.rotation = t.rotation;
      }
      continue;
    }

    if (anim.type === 'property' && anim.keyframes?.length) {
      const kfs = anim.keyframes as KfPoint[];
      const fallback = (anim as { easing?: string }).easing;
      const scale = evaluateKfProperty(kfs, progressPct, 'scale', fallback);
      const x = evaluateKfProperty(kfs, progressPct, 'x', fallback);
      const y = evaluateKfProperty(kfs, progressPct, 'y', fallback);
      const opacity = evaluateKfProperty(kfs, progressPct, 'opacity', fallback);
      const rotation = evaluateKfProperty(kfs, progressPct, 'rotation', fallback);
      if (scale !== undefined) result.scale = scale;
      if (x !== undefined) result.x = x;
      if (y !== undefined) result.y = y;
      if (opacity !== undefined) result.opacity = opacity;
      if (rotation !== undefined) result.rotation = rotation;
    }
  }

  return result;
}
