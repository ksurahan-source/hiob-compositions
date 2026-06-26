/**
 * speedRamp.tsx — editorial "speed-ramp" whip for a clip.
 *
 * The clip holds, then over a short window it ACCELERATES: a directional translate
 * kick + a scale punch + a motion-blur spike that all rise and clear on a triangular
 * envelope. This is the short-form "speed ramp / whip" beat-cut look. Deterministic
 * (frame math only, no Math.random / Date); composes into transformEffects().
 *
 * IMPORTANT — what this is NOT: Remotion's <OffthreadVideo playbackRate> is a CONSTANT
 * per render, so this is a MOTION speed-ramp (camera whip), not source time-remapping
 * / slow-mo. True source slow-mo needs frame-interpolation upstream (a Topaz/AI pre-pass).
 * A constant per-clip source speed is already available separately via clip.attributes.speed.
 *
 * Returns transform + filter fragments; the caller appends them to the clip's strings.
 */
import { interpolate } from 'remotion';

export type SpeedRampDirection = 'left' | 'right' | 'up' | 'down' | 'none';

export interface SpeedRampOptions {
  /** Whip point as fraction [0..1] of clip duration. Default 0.68. */
  at?: number;
  /** Whip window length in frames. Default 6. */
  frames?: number;
  /** Translate kick as % of axis at the whip peak. Default 8. Clamped 0..40. */
  intensity?: number;
  /** Peak directional motion-blur in px. Default 16. Clamped 0..40. */
  blur?: number;
  /** Scale punch at the whip peak. Default 1.06. Clamped 1..1.4. */
  zoom?: number;
  /** Direction of the whip kick. Default 'left'. */
  direction?: string;
}

const DIRECTIONS = new Set<SpeedRampDirection>(['left', 'right', 'up', 'down', 'none']);

function normalizeDirection(value?: string): SpeedRampDirection {
  return value && DIRECTIONS.has(value as SpeedRampDirection)
    ? (value as SpeedRampDirection)
    : 'left';
}

export function speedRampStyle(
  frame: number,
  durationInFrames: number,
  opts?: SpeedRampOptions,
): { transform: string; filter: string } {
  const at = Math.max(0, Math.min(1, opts?.at ?? 0.68));
  const win = Math.max(1, opts?.frames ?? 6);
  const intensity = Math.max(0, Math.min(40, opts?.intensity ?? 8));
  const maxBlur = Math.max(0, Math.min(40, opts?.blur ?? 16));
  const zoom = Math.max(1, Math.min(1.4, opts?.zoom ?? 1.06));
  const direction = normalizeDirection(opts?.direction);

  const whipStart = Math.floor(durationInFrames * at);
  const local = frame - whipStart;
  if (local < 0 || local > win) {
    return { transform: '', filter: '' };
  }

  // Triangular 0 → 1 → 0 envelope across the whip window.
  const half = win / 2;
  const env =
    local <= half
      ? interpolate(local, [0, half], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
      : interpolate(local, [half, win], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const kick = intensity * env;
  let tx = 0;
  let ty = 0;
  if (direction === 'left') tx = -kick;
  else if (direction === 'right') tx = kick;
  else if (direction === 'up') ty = -kick;
  else if (direction === 'down') ty = kick;

  const scale = 1 + (zoom - 1) * env;
  const blur = maxBlur * env;

  return {
    transform: ` translate(${tx.toFixed(2)}%, ${ty.toFixed(2)}%) scale(${scale.toFixed(4)})`,
    filter: blur > 0.01 ? `blur(${blur.toFixed(2)}px)` : '',
  };
}
