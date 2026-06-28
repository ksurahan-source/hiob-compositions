/**
 * Animation Registry — centralized preset animation library.
 *
 * All motion lives here, not scattered across component files.
 * Renderers call `registry.getPreset(id)` to apply named animation curves.
 * New presets require zero changes to renderer code — just add an entry here.
 */
import { interpolate } from 'remotion';
import { getEasing } from './easing';

export interface AnimationTransform {
  scale?: number;
  x?: number;
  y?: number;
  opacity?: number;
  rotation?: number;
}

export type PresetIntensity = 'subtle' | 'medium' | 'strong';

/** A pure, deterministic preset animation function. frame is relative to animation start. */
export type PresetAnimationFn = (
  frame: number,
  fps: number,
  durationInFrames: number,
  intensity?: PresetIntensity,
) => AnimationTransform;

const pickI = (i: PresetIntensity | undefined, s: number, m: number, l: number) =>
  (i === 'subtle' ? s : i === 'strong' ? l : m);

/** Eased ramp from→to over [0,dur] frames; overshoot easings sail past `to` then settle. */
const ramp = (frame: number, dur: number, from: number, to: number, easing: string) => {
  const t = Math.max(0, Math.min(1, frame / Math.max(1, dur)));
  return from + getEasing(easing)(t) * (to - from);
};

function clipHash(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash * 31) + id.charCodeAt(i)) >>> 0;
  return hash;
}

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const builtinPresets: Record<string, PresetAnimationFn> = {
  'ken-burns-left': (frame, _fps, dur) => {
    const p = interpolate(frame, [0, dur], [0, 1], clamp);
    return {
      scale: interpolate(p, [0, 1], [1.0, 1.07], clamp),
      x: interpolate(p, [0, 1], [-1.8, 1.8], clamp),
      y: 0,
    };
  },

  'ken-burns-right': (frame, _fps, dur) => {
    const p = interpolate(frame, [0, dur], [0, 1], clamp);
    return {
      scale: interpolate(p, [0, 1], [1.0, 1.07], clamp),
      x: interpolate(p, [0, 1], [1.8, -1.8], clamp),
      y: 0,
    };
  },

  'ken-burns-up': (frame, _fps, dur) => {
    const p = interpolate(frame, [0, dur], [0, 1], clamp);
    return {
      scale: interpolate(p, [0, 1], [1.0, 1.07], clamp),
      x: 0,
      y: interpolate(p, [0, 1], [-1.8, 1.8], clamp),
    };
  },

  'ken-burns-down': (frame, _fps, dur) => {
    const p = interpolate(frame, [0, dur], [0, 1], clamp);
    return {
      scale: interpolate(p, [0, 1], [1.0, 1.07], clamp),
      x: 0,
      y: interpolate(p, [0, 1], [1.8, -1.8], clamp),
    };
  },

  /** Gentle additive drift for sub-shots (on top of existing reframe scale). */
  'subshot-drift': (frame, _fps, dur) => {
    const p = interpolate(frame, [0, dur], [0, 1], clamp);
    // Use frame-seeded direction for determinism (caller provides stable frame+dur combo)
    const seed = (frame + dur) & 0xffffff;
    const direction = seed % 4;
    const pan = interpolate(p, [0, 1], [-0.8, 0.8], clamp);
    const zoomIn = (seed >> 2) % 2 === 0;
    const scale = zoomIn
      ? interpolate(p, [0, 1], [1.0, 1.035], clamp)
      : interpolate(p, [0, 1], [1.035, 1.0], clamp);
    return {
      scale,
      x: direction === 0 ? pan : direction === 1 ? -pan : 0,
      y: direction === 2 ? pan : direction === 3 ? -pan : 0,
    };
  },

  'fade-in': (frame, _fps, dur) => ({
    opacity: interpolate(frame, [0, dur], [0, 1], clamp),
  }),

  'fade-out': (frame, _fps, dur) => ({
    opacity: interpolate(frame, [0, dur], [1, 0], clamp),
  }),

  'scale-in': (frame, _fps, dur) => ({
    scale: interpolate(frame, [0, dur], [0.8, 1.0], clamp),
    opacity: interpolate(frame, [0, Math.min(dur * 0.5, 15)], [0, 1], clamp),
  }),

  'scale-out': (frame, _fps, dur) => ({
    scale: interpolate(frame, [0, dur], [1.0, 0.8], clamp),
    opacity: interpolate(frame, [Math.max(0, dur * 0.5), dur], [1, 0], clamp),
  }),

  'slide-in-left': (frame, _fps, dur) => ({
    x: interpolate(frame, [0, dur], [-100, 0], clamp),
    opacity: interpolate(frame, [0, Math.min(dur * 0.3, 10)], [0, 1], clamp),
  }),

  'slide-in-right': (frame, _fps, dur) => ({
    x: interpolate(frame, [0, dur], [100, 0], clamp),
    opacity: interpolate(frame, [0, Math.min(dur * 0.3, 10)], [0, 1], clamp),
  }),

  'slide-in-up': (frame, _fps, dur) => ({
    y: interpolate(frame, [0, dur], [100, 0], clamp),
    opacity: interpolate(frame, [0, Math.min(dur * 0.3, 10)], [0, 1], clamp),
  }),

  'punch-in': (frame, _fps, dur) => {
    const halfDur = dur / 2;
    const scale = frame <= halfDur
      ? interpolate(frame, [0, halfDur], [1.0, 1.08], clamp)
      : interpolate(frame, [halfDur, dur], [1.08, 1.0], clamp);
    return { scale };
  },

  // ── Envato-grade pro presets (scale/rotation/opacity — unit-unambiguous in the
  //    ReelDoc element transform). ids mirror the live clips[] catalog so a ReelDoc
  //    and an editor clip can request the SAME motion by name. Translate-heavy camera
  //    presets are authored on the live keyframe path until the ReelDoc x/y unit is
  //    finalized; these settle exactly on their target so no end-state drift. ──
  'snap-zoom-in': (frame, _fps, dur, i) => ({
    scale: ramp(frame, dur, pickI(i, 0.6, 0.2, 0.0), 1, 'ease-out-back'),
    opacity: ramp(frame, dur * 0.5, 0, 1, 'ease-out-cubic'),
  }),
  'overshoot-pop': (frame, _fps, dur, i) => {
    const rot = pickI(i, 0, 6, 12);
    const out: AnimationTransform = {
      scale: ramp(frame, dur, 0, 1, 'ease-out-back'),
      opacity: ramp(frame, dur * 0.35, 0, 1, 'ease-out'),
    };
    if (rot) out.rotation = ramp(frame, dur, rot, 0, 'ease-out-back');
    return out;
  },
  'pop-scale': (frame, _fps, dur, i) => ({
    scale: ramp(frame, dur, pickI(i, 0.4, 0.1, 0.0), 1, 'ease-out-back'),
    opacity: ramp(frame, dur * 0.4, 0, 1, 'ease-out'),
  }),
  'dolly-push-in': (frame, _fps, dur, i) => ({
    scale: ramp(frame, dur, 1, pickI(i, 1.1, 1.25, 1.4), 'ease-out-expo'),
  }),
  punch: (frame, _fps, dur, i) => {
    const peak = pickI(i, 1.06, 1.15, 1.3);
    const half = dur / 2;
    const scale = frame <= half
      ? ramp(frame, half, 1, peak, 'ease-out-back')
      : ramp(frame - half, half, peak, 1, 'ease-out-cubic');
    return { scale };
  },
  kick: (frame, _fps, dur, i) => {
    const s = pickI(i, 1.08, 1.2, 1.35);
    const r = pickI(i, 5, 15, 25);
    const a = dur * 0.4;
    const scale = frame <= a ? ramp(frame, a, 1, s, 'ease-out-back') : ramp(frame - a, dur - a, s, 1, 'ease-out-cubic');
    const rotation = frame <= a ? ramp(frame, a, 0, r, 'ease-out-back') : ramp(frame - a, dur - a, r, 0, 'ease-out-cubic');
    return { scale, rotation };
  },
  'bounce-in': (frame, _fps, dur) => {
    const t = Math.max(0, Math.min(1, frame / Math.max(1, dur)));
    // Damped overshoot that settles exactly on 1.0 at t=1 (no end drift).
    const scale = 1 - Math.cos(t * Math.PI * 2.5) * Math.pow(1 - t, 2);
    return { scale, opacity: ramp(frame, dur * 0.3, 0, 1, 'ease-out') };
  },
};

export class AnimationRegistry {
  private presets: Record<string, PresetAnimationFn> = { ...builtinPresets };

  getPreset(id: string): PresetAnimationFn | null {
    return this.presets[id] ?? null;
  }

  registerPreset(id: string, fn: PresetAnimationFn): void {
    this.presets[id] = fn;
  }

  listPresets(): string[] {
    return Object.keys(this.presets);
  }
}

export const defaultAnimationRegistry = new AnimationRegistry();
