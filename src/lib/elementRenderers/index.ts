/**
 * Element Renderer Registry — extensible dispatcher for ReelDoc element types.
 *
 * Each element type (video, text, shape, audio, composition) registers a
 * pure renderer function. ReelDocCanvas dispatches to the right renderer
 * without hard-coded branching. New element types require no core changes.
 */
import type * as React from 'react';
import type { Animation, Element } from '@hiob/timeline/schema';
import type { LocaleConfig } from '../../localeConfig';
import type { AnimationRegistry, AnimationTransform, PresetIntensity } from '../animationRegistry';
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
const TRANSFORM_KEYS = ['scale', 'x', 'y', 'opacity', 'rotation'] as const;

function mergeDefinedTransform(
  result: AnimationTransform,
  transform: AnimationTransform,
): void {
  for (const key of TRANSFORM_KEYS) {
    const value = transform[key];
    if (value !== undefined) result[key] = value;
  }
}

function applyPresetAnimation(
  anim: Extract<Animation, { type: 'preset' }>,
  frameInAnim: number,
  fps: number,
  animDurFrames: number,
  registry: AnimationRegistry,
): AnimationTransform {
  const preset = registry.getPreset(anim.presetId);
  return preset
    ? preset(frameInAnim, fps, animDurFrames, anim.intensity as PresetIntensity)
    : {};
}

function applyPropertyAnimation(
  anim: Extract<Animation, { type: 'property' }>,
  progressPct: number,
): AnimationTransform {
  if (!anim.keyframes?.length) return {};
  const keyframes = anim.keyframes as KfPoint[];
  const transform: AnimationTransform = {};
  for (const key of TRANSFORM_KEYS) {
    const value = evaluateKfProperty(keyframes, progressPct, key, anim.easing);
    if (value !== undefined) transform[key] = value;
  }
  return transform;
}

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

    const transform = anim.type === 'preset'
      ? applyPresetAnimation(anim, frameInAnim, fps, animDurFrames, registry)
      : applyPropertyAnimation(anim, progressPct);
    mergeDefinedTransform(result, transform);
  }

  return result;
}
