/**
 * lightSweep.tsx — a specular light bar that sweeps diagonally across a clip.
 *
 * The premium "screen glint" pass: a soft, skewed highlight travels across the clip
 * once (or on a loop), screen-blended over the media. DISTINCT from <LightLeak>, which
 * blooms a warm leak from an edge at scene CUTS — this is an in-clip sheen, good on a
 * product reveal, a logo, or a glossy proof card.
 *
 * Pure props (the clip-local frame is passed in by effectOverlays) so it stays
 * frame-synced under the Lambda render. Deterministic: no Math.random / Date.
 */
import type React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';

export interface LightSweepProps {
  /** Clip-local current frame. */
  frame: number;
  /** Clip duration in frames (used to place the sweep window). */
  durationInFrames: number;
  /** Start of the sweep as a fraction [0..1] of clip duration. Default 0.12. */
  at?: number;
  /** Sweep length in frames. Default 18. */
  frames?: number;
  /** Bar tilt in degrees. Default 18. */
  angle?: number;
  /** Highlight color (rgba). Default warm white. */
  color?: string;
  /** Bar width as % of travel. Default 26. */
  width?: number;
  /** Peak opacity 0..1. Default 0.6. */
  opacity?: number;
  /** Repeat the sweep on a loop instead of once. Default false. */
  loop?: boolean;
}

export const LightSweep: React.FC<LightSweepProps> = ({
  frame,
  durationInFrames,
  at = 0.12,
  frames = 18,
  angle = 18,
  color = 'rgba(255,255,255,0.85)',
  width = 26,
  opacity = 0.6,
  loop = false,
}: LightSweepProps) => {
  const win = Math.max(1, frames);
  const w = Math.max(2, Math.min(80, width));
  const peak = Math.max(0, Math.min(1, opacity));

  let p: number;
  if (loop) {
    p = (((frame % win) + win) % win) / win;
  } else {
    const start = Math.floor(durationInFrames * Math.max(0, Math.min(1, at)));
    const local = frame - start;
    if (local < 0 || local > win) return null;
    p = local / win;
  }

  // Bar center travels from off the leading edge to off the trailing edge.
  const travel = interpolate(p, [0, 1], [-w, 100 + w], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // Brightness rises then falls so the glint blooms in the middle of the pass.
  const fade = Math.sin(Math.PI * Math.max(0, Math.min(1, p)));

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'screen', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          top: '-25%',
          bottom: '-25%',
          left: `${travel}%`,
          width: `${w}%`,
          transform: `skewX(${-angle}deg)`,
          background: `linear-gradient(90deg, transparent 0%, ${color} 50%, transparent 100%)`,
          opacity: fade * peak,
          filter: 'blur(6px)',
        }}
      />
    </AbsoluteFill>
  );
}

export default LightSweep;
