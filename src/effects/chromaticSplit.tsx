/**
 * chromaticSplit.tsx — RGB-split (chromatic aberration) fringe as a pure CSS filter.
 *
 * The cheap-but-convincing channel-separation look: a red ghost shifted one way and a
 * cyan ghost the other, so edges fringe like a glitch / lo-fi lens. Implemented with two
 * offset colored drop-shadows (the SAME technique the `glow` effect already uses), so it
 *   - needs NO SVG <filter> def in the DOM,
 *   - composes with the other filters accumulated in transformEffects(),
 *   - is GPU-cheap and fully deterministic (frame math only, no Math.random / Date) → render==render
 *     is byte-stable. (NOTE F-8/MED-33: drop-shadow is GPU-rasterized, so the <Player> preview is a
 *     close guide but can differ subtly from the Lambda render — not byte-for-byte preview==render.)
 *
 * Returns a CSS `filter` fragment; the caller appends it to the clip's filter string.
 */

export interface ChromaticSplitOptions {
  /** Max channel offset in px. Default 4. Clamped 0..24. */
  intensity?: number;
  /** Fringe alpha 0..1. Default 0.6. */
  alpha?: number;
  /** When true, the offset oscillates by frame for a glitchy pulse. Default false. */
  pulse?: boolean;
  /** Split axis — 'x' (horizontal) or 'y' (vertical). Default 'x'. */
  axis?: string;
}

export function chromaticSplitFilter(frame: number, opts?: ChromaticSplitOptions): string {
  const base = Math.max(0, Math.min(24, opts?.intensity ?? 4));
  const alpha = Math.max(0, Math.min(1, opts?.alpha ?? 0.6));
  const pulse = opts?.pulse ?? false;
  const axis = opts?.axis === 'y' ? 'y' : 'x';

  // Deterministic oscillation between ~0.55x and 1.0x the base offset.
  const off = pulse ? base * (0.55 + 0.45 * Math.abs(Math.sin(frame * 0.5))) : base;
  const dx = axis === 'x' ? off : 0;
  const dy = axis === 'y' ? off : 0;

  const red = `rgba(255,0,40,${alpha})`;
  const cyan = `rgba(0,200,255,${alpha})`;
  return (
    `drop-shadow(${dx.toFixed(2)}px ${dy.toFixed(2)}px 0 ${red}) ` +
    `drop-shadow(${(-dx).toFixed(2)}px ${(-dy).toFixed(2)}px 0 ${cyan})`
  );
}
