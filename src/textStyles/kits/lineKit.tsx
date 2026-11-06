// Shared helpers for candidate c1 presets. Pure, frame-driven, no randomness.
import React from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Easing, interpolate } from 'remotion';
import { CAPTION_ZONE_CLIP, SAFE, TITLE_ZONE_CLIP, W } from '../contract';

export const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** 0→1 (or from→to) between frames a..b, clamped, ease-out cubic by default. */
export const ease = (
  f: number,
  a: number,
  b: number,
  from = 0,
  to = 1,
  easing: (t: number) => number = Easing.out(Easing.cubic),
): number => interpolate(f, [a, b], [from, to], { ...CLAMP, easing });

/** Frames between caption line 1 and line 2 entering (line-by-line, never per word). */
export const LINE_STAGGER = 5;

/** Korean-safe text defaults. */
export const KO: CSSProperties = { wordBreak: 'keep-all', overflowWrap: 'break-word' };

export const CONTENT_W = W - SAFE.x * 2;

type Align = 'flex-start' | 'center' | 'flex-end';

/** Absolute box covering exactly the title or caption safe zone. */
export const Zone: React.FC<{
  kind: 'title' | 'caption';
  align?: Align;
  justify?: Align;
  gap?: number;
  style?: CSSProperties;
  children?: ReactNode;
}> = ({ kind, align = 'center', justify = 'center', gap = 0, style, children }) => {
  const top = kind === 'title' ? SAFE.titleTop : SAFE.captionTop;
  const bottom = kind === 'title' ? SAFE.titleBottom : SAFE.captionBottom;
  return (
    <div
      style={{
        position: 'absolute',
        left: SAFE.x,
        width: CONTENT_W,
        top,
        height: bottom - top,
        display: 'flex',
        flexDirection: 'column',
        alignItems: align,
        justifyContent: justify,
        gap,
        clipPath: kind === 'title' ? TITLE_ZONE_CLIP : CAPTION_ZONE_CLIP,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const splitTitle = (text: string): string[] => text.split('\n').filter((l) => l.length > 0);

export interface Segment {
  text: string;
  em: boolean;
}

/** Split one line into plain / emphasis segments (emphasis styled as a whole, once). */
export const splitEmphasis = (line: string, emphasis?: string): Segment[] => {
  if (!emphasis) return [{ text: line, em: false }];
  const i = line.indexOf(emphasis);
  if (i < 0) return [{ text: line, em: false }];
  return [
    { text: line.slice(0, i), em: false },
    { text: emphasis, em: true },
    { text: line.slice(i + emphasis.length), em: false },
  ].filter((s) => s.text.length > 0);
};

/** Deterministic pseudo-noise in [0,1) from an integer-ish seed. */
export const noise = (seed: number): number => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Outlined text without relying on paint-order: a stroked copy sits behind the fill copy.
 * `stroke` is the visible outline width in px.
 */
export const StrokeText: React.FC<{
  stroke: number;
  strokeColor: string;
  style?: CSSProperties;
  children: ReactNode;
}> = ({ stroke, strokeColor, style, children }) => (
  <span style={{ position: 'relative', display: 'inline-block', ...style }}>
    <span
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        WebkitTextStroke: `${stroke * 2}px ${strokeColor}`,
        color: strokeColor,
        strokeLinejoin: 'round',
      }}
    >
      {children}
    </span>
    <span style={{ position: 'relative' }}>{children}</span>
  </span>
);

/** Format an integer with thousands separators (deterministic, locale-free). */
export const groupDigits = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * Replace every number in `text` with its value at progress p (0..1).
 * Keeps original comma grouping style; returns text unchanged when there is no digit.
 */
export const countUpText = (text: string, p: number): string => {
  if (p >= 1) return text;
  return text.replace(/\d[\d,]*/g, (m, offset: number) => {
    const before = text[offset - 1];
    const after = text[offset + m.length];
    // Leave codes, years-with-leading-zero, phone/model numbers and decimals untouched.
    if (before === '-' || before === '.' || after === '-' || after === '.') return m;
    if (m.length > 1 && m.startsWith('0')) return m;
    const grouped = m.includes(',');
    if (grouped && !/^\d{1,3}(,\d{3})+$/.test(m)) return m;
    const digits = m.replace(/,/g, '');
    if (digits.length > 9) return m;
    const v = Math.round(Number(digits) * p);
    return grouped ? groupDigits(v) : String(v);
  });
};

export const hasDigit = (text: string): boolean => /\d/.test(text);
