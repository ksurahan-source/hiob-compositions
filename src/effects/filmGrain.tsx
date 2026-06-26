import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * FilmGrain - Deterministic film grain overlay
 *
 * Applies a subtle, deterministic film grain texture that shimmers per-frame
 * without using Math.random(). Uses SVG <feTurbulence type="fractalNoise">
 * seeded by frame number for a natural, organic grain effect that kills AI gloss.
 *
 * Determinism: Grain pattern is 100% deterministic, seeded by frame number.
 * Each render of frame N will produce the identical grain.
 *
 * Performance: GPU-accelerated SVG filter, no per-pixel JS. Extremely cheap.
 *
 * @param opacity - Grain opacity (0–1), default 0.08 (8%)
 * @param blend - CSS mix-blend-mode, default 'overlay'. Try 'soft-light' for softer effect.
 */
export const FilmGrain: React.FC<{
  opacity?: number;
  blend?: React.CSSProperties['mixBlendMode'];
}> = ({ opacity = 0.08, blend = 'overlay' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Deterministic baseFrequency shift per frame.
  // Seed: frame / fps gives a slow, smooth time-based variation.
  // Scaled by 0.5 to keep baseFrequency in a perceptually good range (~0.8–1.2).
  const timeValue = (frame / fps) * 0.5;
  const baseFrequency = 0.8 + (timeValue % 0.4);

  // For octaves (detail), add subtle variation to make grain shimmer
  // without being obvious. Use frame modulo to cycle through a few octave values.
  const octaveShift = (frame % 120) / 120; // 0–1, cycles every 120 frames
  const octaves = 3 + octaveShift * 0.5; // 3–3.5 octaves

  // Use a stable filter ID (not frame-dependent) to allow browser/SVG caching.
  // The per-frame variation comes from the `seed` attribute in <feTurbulence>.
  const filterId = 'film-grain-filter';

  const filterStyles: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    mixBlendMode: blend,
    opacity,
    zIndex: 9999,
  };

  return (
    <AbsoluteFill style={filterStyles}>
      <svg
        width="100%"
        height="100%"
        style={{ display: 'block' }}
        preserveAspectRatio="none"
      >
        <defs>
          <filter id={filterId}>
            {/* fractalNoise produces organic grain texture */}
            <feTurbulence
              type="fractalNoise"
              baseFrequency={baseFrequency}
              numOctaves={Math.floor(octaves)}
              result="noise"
              seed={frame}
            />
            {/* colorMatrix boosts contrast for visible grain */}
            <feColorMatrix
              in="noise"
              type="saturate"
              values="0.3"
              result="saturated"
            />
            {/* Blend grain with source graphic */}
            <feComposite
              in="saturated"
              in2="SourceGraphic"
              operator="multiply"
              result="output"
            />
          </filter>
        </defs>
        {/* Full-screen rectangle with grain filter applied */}
        <rect
          width="100%"
          height="100%"
          fill="white"
          opacity="0"
          filter={`url(#${filterId})`}
        />
      </svg>
    </AbsoluteFill>
  );
};

/**
 * Helper: computeFilmGrainOpacity
 * Derive opacity from a duration and fade in/out points.
 * Useful for applying grain only during certain sections of a composition.
 *
 * @param frame - Current frame number
 * @param fps - Frames per second
 * @param fadeInFrames - Number of frames to fade in (0 = no fade)
 * @param fadeOutStartFrame - Frame at which fade-out begins
 * @returns Opacity value 0–1
 */
export const computeFilmGrainOpacity = (
  frame: number,
  fps: number,
  fadeInFrames: number,
  fadeOutStartFrame: number
): number => {
  if (frame < fadeInFrames) {
    return (frame / fadeInFrames) * 0.08; // Fade in to 8%
  }
  if (frame >= fadeOutStartFrame) {
    const framesIntoFadeOut = frame - fadeOutStartFrame;
    const fadeOutDuration = fps * 0.5; // Fade out over 0.5 seconds
    return Math.max(0, 0.08 * (1 - framesIntoFadeOut / fadeOutDuration));
  }
  return 0.08; // Full opacity
};

export default FilmGrain;
