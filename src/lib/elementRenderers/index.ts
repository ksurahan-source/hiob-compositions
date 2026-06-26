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
import { interpolate } from 'remotion';

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
  return interpolate(progress, [0, 1], [bv, av], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
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

    if (anim.type === 'property' && anim.keyframes?.length) {
      const kfs = anim.keyframes as KfPoint[];
      const scale = evaluateKfProperty(kfs, progressPct, 'scale');
      const x = evaluateKfProperty(kfs, progressPct, 'x');
      const y = evaluateKfProperty(kfs, progressPct, 'y');
      const opacity = evaluateKfProperty(kfs, progressPct, 'opacity');
      const rotation = evaluateKfProperty(kfs, progressPct, 'rotation');
      if (scale !== undefined) result.scale = scale;
      if (x !== undefined) result.x = x;
      if (y !== undefined) result.y = y;
      if (opacity !== undefined) result.opacity = opacity;
      if (rotation !== undefined) result.rotation = rotation;
    }
  }

  return result;
}
