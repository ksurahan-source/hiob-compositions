/**
 * Animation Registry — centralized preset animation library.
 *
 * All motion lives here, not scattered across component files.
 * Renderers call `registry.getPreset(id)` to apply named animation curves.
 * New presets require zero changes to renderer code — just add an entry here.
 */
import { interpolate } from 'remotion';

export interface AnimationTransform {
  scale?: number;
  x?: number;
  y?: number;
  opacity?: number;
  rotation?: number;
}

/** A pure, deterministic preset animation function. frame is relative to animation start. */
export type PresetAnimationFn = (
  frame: number,
  fps: number,
  durationInFrames: number,
) => AnimationTransform;

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
