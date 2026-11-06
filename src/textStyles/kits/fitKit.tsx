import React from 'react';
import { Easing, interpolate } from 'remotion';
import { CAPTION_ZONE_CLIP, SAFE, TITLE_ZONE_CLIP } from '../contract';

// Clamped interpolate (frame-driven only).
export const ci = (
  f: number,
  input: [number, number],
  output: [number, number],
  easing: (t: number) => number = Easing.bezier(0.16, 1, 0.3, 1),
): number => interpolate(f, input, output, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing });

export const KO: React.CSSProperties = { wordBreak: 'keep-all', overflowWrap: 'normal' };

const zone = (top: number, bottom: number): React.CSSProperties => ({
  position: 'absolute',
  left: SAFE.x,
  right: SAFE.x,
  top,
  height: bottom - top,
  display: 'flex',
  flexDirection: 'column',
});

export const TitleZone: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ ...zone(SAFE.titleTop, SAFE.titleBottom), clipPath: TITLE_ZONE_CLIP, alignItems: 'center', justifyContent: 'center', ...style }}>{children}</div>
);

export const CaptionZone: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ ...zone(SAFE.captionTop, SAFE.captionBottom), clipPath: CAPTION_ZONE_CLIP, alignItems: 'center', justifyContent: 'center', ...style }}>{children}</div>
);

export const ZONE_W = 1080 - SAFE.x * 2; // 900

// Rough Hangul width estimate in em (full-width syllable = 1em).
export const emWidth = (text: string): number =>
  Array.from(text).reduce((w, ch) => {
    if (ch === ' ') return w + 0.3;
    if (/[0-9]/.test(ch)) return w + 0.6;
    if (/[.,%!?:·'"]/.test(ch)) return w + 0.4;
    if (/[A-Za-z]/.test(ch)) return w + 0.62;
    return w + 1;
  }, 0);

// Largest font size <= base so that every line fits maxWidth (never below min).
export const fitSize = (lines: string[], base: number, maxWidth: number, min: number, tracking = 0): number => {
  const widest = Math.max(...lines.map((l) => emWidth(l) + Array.from(l).length * tracking));
  return Math.max(min, Math.min(base, Math.floor(maxWidth / Math.max(widest, 0.01))));
};

export const splitLines = (text: string): string[] => text.split('\n');

// Split a line around the emphasis phrase (whole phrase, once).
export const splitEmphasis = (line: string, emphasis?: string): { pre: string; em: string; post: string } | null => {
  if (!emphasis) return null;
  const i = line.indexOf(emphasis);
  if (i < 0) return null;
  return { pre: line.slice(0, i), em: emphasis, post: line.slice(i + emphasis.length) };
};

// Strong outline that survives bright footage (paint-order keeps fill crisp).
export const stroke = (px: number, color = '#000'): React.CSSProperties => ({
  WebkitTextStroke: `${px}px ${color}`,
  paintOrder: 'stroke fill',
});
