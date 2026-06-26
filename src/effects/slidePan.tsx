/**
 * slidePan.tsx — Fast, motion-blurred DIRECTIONAL SLIDE PAN entrance.
 *
 * Replaces slow cross-dissolves with snappy directional slides (L/R/U/D) with
 * motion blur that decays to 0. Deterministic via seed-based direction picking.
 *
 * Core export: slidePanEntrance(frame, fps, direction, opts?) → React.CSSProperties
 * Helper: pickDirection(clipIndex: number): PanDirection
 */

import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type React from 'react';

/**
 * Direction union for pan entrance.
 */
export type PanDirection = 'left' | 'right' | 'up' | 'down';

/**
 * Options for slidePanEntrance.
 */
export interface SlidePanEntranceOptions {
  /** Duration of entrance in frames. Defaults to 8. */
  frames?: number;
  /** Distance traveled as % of axis. Defaults to 14. */
  distance?: number;
}

/**
 * Deterministic direction picker — cycles through L/R/U/D by clip index.
 * @param index Clip or element index
 * @returns PanDirection determined by index % 4
 */
export function pickDirection(index: number): PanDirection {
  const directions: PanDirection[] = ['left', 'right', 'up', 'down'];
  return directions[(Math.abs(index) % 4)];
}

/**
 * Pure style generator for directional slide-pan entrance with motion blur.
 * Over the entrance window (default 8 frames), slides in from offscreen in the
 * given direction with directional motion blur that decays to 0. After the window,
 * returns identity (no-op). Eases out (cubic).
 *
 * @param frame Current frame (0-indexed)
 * @param fps Frames per second from useVideoConfig()
 * @param direction Pan direction ('left' | 'right' | 'up' | 'down')
 * @param opts Optional { frames?: number; distance?: number }
 * @returns React.CSSProperties for transform, filter, opacity
 */
export function slidePanEntrance(
  frame: number,
  fps: number,
  direction: PanDirection,
  opts?: SlidePanEntranceOptions
): React.CSSProperties {
  const entranceFrames = opts?.frames ?? 8;
  const distance = opts?.distance ?? 14; // % of axis

  // Clamp progress: 0 at frame 0, 1 at frame entranceFrames, stays 1 after
  const progress = interpolate(frame, [0, entranceFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Cubic ease-out: 3t² − 2t³
  const easeProgress = 1 - Math.pow(1 - progress, 3);

  // Motion blur decay: strong at start (progress=0), fades to 0 (progress=1)
  const blurAmount = interpolate(easeProgress, [0, 1], [12, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Translate direction: slides IN from off-screen
  // At progress=0: full negative offset (off-screen in the incoming direction)
  // At progress=easeProgress: interpolate towards 0 (fully on-screen)
  let translateX = 0;
  let translateY = 0;
  let filterDir = 'blur(0px)'; // fallback

  if (direction === 'left') {
    // Slides in from the right (negative distance)
    translateX = interpolate(easeProgress, [0, 1], [distance, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    // Horizontal blur (x-direction) decays as it slides in
    filterDir = `blur(${blurAmount}px)`;
  } else if (direction === 'right') {
    // Slides in from the left (positive distance)
    translateX = interpolate(easeProgress, [0, 1], [-distance, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    filterDir = `blur(${blurAmount}px)`;
  } else if (direction === 'up') {
    // Slides in from below (negative distance)
    translateY = interpolate(easeProgress, [0, 1], [distance, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    filterDir = `blur(${blurAmount}px)`;
  } else if (direction === 'down') {
    // Slides in from above (positive distance)
    translateY = interpolate(easeProgress, [0, 1], [-distance, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    filterDir = `blur(${blurAmount}px)`;
  }

  return {
    transform: `translate(${translateX}%, ${translateY}%)`,
    filter: filterDir,
    opacity: 1, // Stays fully opaque throughout
  };
}

/**
 * React component variant (optional). Wraps slidePanEntrance for use in JSX.
 * Requires useCurrentFrame() and useVideoConfig() from Remotion context.
 * Use if composing with other effects or need a component interface.
 */
interface SlidePanEntranceComponentProps extends SlidePanEntranceOptions {
  direction: PanDirection;
  children: React.ReactNode;
}

/**
 * SlidePanEntrance component. Automatically applies slide-pan entrance effect.
 * Pulls frame and fps from Remotion context via hooks.
 * @example
 * <SlidePanEntrance direction="left" frames={12}>
 *   <img src="hero.jpg" />
 * </SlidePanEntrance>
 */
export function SlidePanEntrance({
  direction,
  frames,
  distance,
  children,
}: SlidePanEntranceComponentProps): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const styles = slidePanEntrance(frame, fps, direction, { frames, distance });

  return (
    <div style={styles}>
      {children}
    </div>
  );
}
