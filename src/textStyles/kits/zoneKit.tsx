import React from 'react';
import type { CSSProperties, FC, ReactNode } from 'react';
import { interpolate, spring } from 'remotion';
import { CAPTION_ZONE_CLIP, SAFE, TITLE_ZONE_CLIP, W } from '../contract';

export const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const zoneBase: CSSProperties = {
  position: 'absolute',
  left: SAFE.x,
  width: W - SAFE.x * 2,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
};

type ZoneProps = { children: ReactNode; align?: CSSProperties['alignItems']; justify?: CSSProperties['justifyContent']; style?: CSSProperties };

/** Title safe zone: y 200..560, x 90..990. */
export const TitleZone: FC<ZoneProps> = ({ children, align = 'center', justify = 'center', style }) => (
  <div style={{ ...zoneBase, top: SAFE.titleTop, height: SAFE.titleBottom - SAFE.titleTop, clipPath: TITLE_ZONE_CLIP, alignItems: align, justifyContent: justify, ...style }}>
    {children}
  </div>
);

/** Caption safe zone: y 880..1240, x 90..990. */
export const CaptionZone: FC<ZoneProps> = ({ children, align = 'center', justify = 'center', style }) => (
  <div style={{ ...zoneBase, top: SAFE.captionTop, height: SAFE.captionBottom - SAFE.captionTop, clipPath: CAPTION_ZONE_CLIP, alignItems: align, justifyContent: justify, ...style }}>
    {children}
  </div>
);

export const KOREAN: CSSProperties = { wordBreak: 'keep-all', overflowWrap: 'break-word' };
export const TITLE_TEXT: CSSProperties = { ...KOREAN, whiteSpace: 'pre-line' };

export const titleLines = (text: string): string[] => text.split('\n');

/** Spring progress for line `index`, staggered. Deterministic in frame. */
export const lineSpring = (
  frame: number,
  fps: number,
  index: number,
  opts: { delay?: number; stagger?: number; damping?: number; mass?: number; stiffness?: number } = {},
): number => {
  const { delay = 0, stagger = 6, damping = 200, mass = 1, stiffness = 100 } = opts;
  return spring({ frame: frame - delay - index * stagger, fps, config: { damping, mass, stiffness } });
};

/** 1 → 0 over the last `n` frames of a cue (optional soft exit). */
export const cueOut = (frame: number, dur: number, n = 6): number =>
  interpolate(frame, [dur - n, dur], [1, 0], CLAMP);

export type Segment = { text: string; isEmphasis: boolean };

/** Split a line into [before, emphasis, after]; whole-phrase only, first occurrence. */
export const splitEmphasis = (line: string, emphasis?: string): Segment[] => {
  if (!emphasis) return [{ text: line, isEmphasis: false }];
  const at = line.indexOf(emphasis);
  if (at < 0) return [{ text: line, isEmphasis: false }];
  return [
    { text: line.slice(0, at), isEmphasis: false },
    { text: emphasis, isEmphasis: true },
    { text: line.slice(at + emphasis.length), isEmphasis: false },
  ].filter((s) => s.text.length > 0);
};

/** Render a line with the emphasis phrase wrapped by `renderEmphasis`. */
export const EmphasisLine: FC<{ line: string; emphasis?: string; renderEmphasis: (t: string) => ReactNode }> = ({
  line,
  emphasis,
  renderEmphasis,
}) => (
  <>
    {splitEmphasis(line, emphasis).map((s, i) =>
      s.isEmphasis ? <React.Fragment key={i}>{renderEmphasis(s.text)}</React.Fragment> : <React.Fragment key={i}>{s.text}</React.Fragment>,
    )}
  </>
);

/** Text stroke that sits behind the fill (paint-order) — keeps glyph shapes crisp. */
export const outline = (width: number, color: string): CSSProperties => ({
  WebkitTextStroke: `${width}px ${color}`,
  paintOrder: 'stroke fill',
});
