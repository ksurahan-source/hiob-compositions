/**
 * punchIn.tsx — Digital jump-zoom punch-in effect for speaker/hero clips.
 *
 * Provides a snappy emphasis pop: gentle base hold at scale 1.0,
 * then a SUDDEN punch to zoom level over 2-3 frames at the trigger point,
 * settling back to a slight hold over the next ~8 frames.
 *
 * Fully deterministic (frame math only, no Math.random or Date).
 * Designed for 9:16 Remotion compositions (1080x1920, 30fps default).
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

/**
 * Options for punch-in behavior.
 */
interface PunchInOptions {
  /** Trigger point as fraction [0..1] of clip duration. Default: 0.5 (midpoint). */
  at?: number;
  /** Peak zoom level (scale). Default: 1.12. */
  zoom?: number;
  /** Settle scale after punch (1.0 = return to normal). Default: 1.05. */
  settle?: number;
}

/**
 * Returns CSS transform string for punch-in effect.
 *
 * Behavior:
 * - Frames 0 to trigger: scale 1.0
 * - Trigger frame: SUDDEN scale jump to opts.zoom over 2-3 frames
 * - Trigger + ~8 frames: settle back to opts.settle
 * - Beyond: hold at opts.settle
 *
 * @param frame Current frame number (0-indexed)
 * @param fps Frames per second (e.g., 30)
 * @param durationInFrames Total clip duration in frames
 * @param opts Punch-in configuration
 * @returns CSS transform string (e.g., "scale(1.12)")
 */
export function punchInTransform(
  frame: number,
  fps: number,
  durationInFrames: number,
  opts?: PunchInOptions
): string {
  const { at = 0.5, zoom = 1.12, settle = 1.05 } = opts || {};

  // Calculate trigger frame
  const triggerFrame = Math.floor(durationInFrames * at);

  // Punch duration: 2-3 frames for snappy feel
  const punchFrames = 2;
  // Settle duration: ~8 frames to return to settle scale
  const settleFrames = 8;

  let scale = 1.0;

  if (frame < triggerFrame) {
    // Pre-trigger: hold at base scale
    scale = 1.0;
  } else if (frame < triggerFrame + punchFrames) {
    // Punch phase: rapid ramp from 1.0 to zoom
    const punchProgress = (frame - triggerFrame) / punchFrames;
    scale = interpolate(punchProgress, [0, 1], [1.0, zoom], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  } else if (frame < triggerFrame + punchFrames + settleFrames) {
    // Settle phase: ramp from zoom back down to settle scale
    const settleProgress = (frame - (triggerFrame + punchFrames)) / settleFrames;
    scale = interpolate(settleProgress, [0, 1], [zoom, settle], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  } else {
    // Hold at settle scale
    scale = settle;
  }

  return `scale(${scale.toFixed(4)})`;
}

/**
 * Returns a style object with transform and transformOrigin for punch-in effect.
 * Convenience wrapper around punchInTransform.
 *
 * @param frame Current frame number (0-indexed)
 * @param fps Frames per second (e.g., 30)
 * @param durationInFrames Total clip duration in frames
 * @param opts Punch-in configuration
 * @returns React.CSSProperties with transform and transformOrigin
 */
export function punchInStyle(
  frame: number,
  fps: number,
  durationInFrames: number,
  opts?: PunchInOptions
): React.CSSProperties {
  return {
    transform: punchInTransform(frame, fps, durationInFrames, opts),
    transformOrigin: 'center center',
  };
}

/**
 * PunchInContainer component — wraps children with punch-in effect.
 *
 * Usage:
 * ```tsx
 * <PunchInContainer durationInFrames={120} opts={{ at: 0.5, zoom: 1.15 }}>
 *   <img src="speaker.jpg" />
 * </PunchInContainer>
 * ```
 */
interface PunchInContainerProps {
  children: React.ReactNode;
  durationInFrames: number;
  opts?: PunchInOptions;
  style?: React.CSSProperties;
}

export const PunchInContainer: React.FC<PunchInContainerProps> = ({
  children,
  durationInFrames,
  opts,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const effectStyle = punchInStyle(frame, fps, durationInFrames, opts);

  return (
    <div
      style={{
        ...style,
        ...effectStyle,
        display: 'inline-block',
      }}
    >
      {children}
    </div>
  );
};
