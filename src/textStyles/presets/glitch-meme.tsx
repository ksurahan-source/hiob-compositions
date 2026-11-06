import React from 'react';
import { useCurrentFrame } from 'remotion';
import { FONT } from '../fonts';
import type { CaptionProps, Preset, TitleProps } from '../contract';
import { KO, LINE_STAGGER, StrokeText, Zone, ease, noise, splitEmphasis } from '../kits/lineKit';

/** Glitch intensity 0..1: a strong intro burst, then short deterministic re-bursts. */
const intensity = (f: number): number => {
  const intro = f < 16 ? 1 - f / 16 : 0;
  const bursts = [58, 59, 60, 61, 104, 105, 106, 128, 129];
  const burst = bursts.includes(f) ? 0.8 : 0;
  return Math.max(intro, burst);
};

const TITLE_STYLE: React.CSSProperties = {
  ...KO,
  whiteSpace: 'pre-line',
  textAlign: 'center',
  fontFamily: FONT.doHyeon,
  fontSize: 128,
  lineHeight: 1.08,
};

const SLICES = 6;

const Title: React.FC<TitleProps> = ({ text }) => {
  const f = useCurrentFrame();
  const g = intensity(f);
  const split = 13 + g * 24; // resting RGB split stays slightly visible
  const jitterX = (noise(f * 3.1) - 0.5) * 40 * g;
  const appear = f < 2 ? 0 : 1;
  return (
    <Zone kind="title" align="center">
      <div style={{ position: 'relative', opacity: appear, transform: `translateX(${jitterX}px) skewX(${(noise(f + 7) - 0.5) * 14 * g}deg)` }}>
        {/* colour channels */}
        <div style={{ ...TITLE_STYLE, position: 'absolute', inset: 0, color: '#00e5ff', transform: `translate(${-split}px, ${g * 4}px)` }}>
          {text}
        </div>
        <div style={{ ...TITLE_STYLE, position: 'absolute', inset: 0, color: '#ff1f5a', transform: `translate(${split}px, ${-g * 4}px)` }}>
          {text}
        </div>
        {/* main layer, cut into horizontal slices that shear during bursts */}
        <div style={{ position: 'relative' }}>
          <div style={{ ...TITLE_STYLE, visibility: 'hidden' }}>{text}</div>
          {g === 0 ? (
            <div style={{ ...TITLE_STYLE, position: 'absolute', inset: 0 }}>
              <StrokeText stroke={6} strokeColor="#000" style={{ color: '#fff' }}>
                {text}
              </StrokeText>
            </div>
          ) : Array.from({ length: SLICES }, (_, k) => {
            const top = (k / SLICES) * 100;
            const bottom = 100 - ((k + 1) / SLICES) * 100;
            const shift = (noise(f * 7 + k * 13) - 0.5) * 70 * g;
            return (
              <div
                key={k}
                style={{
                  ...TITLE_STYLE,
                  position: 'absolute',
                  inset: 0,
                  clipPath: `inset(${top}% 0 ${bottom}% 0)`,
                  transform: `translateX(${shift}px)`,
                }}
              >
                <StrokeText stroke={6} strokeColor="#000" style={{ color: '#fff' }}>
                  {text}
                </StrokeText>
              </div>
            );
          })}
        </div>
      </div>
    </Zone>
  );
};

/** Plain punchy captions: hard cut-in, heavy white type with a black outline. */
const Caption: React.FC<CaptionProps> = ({ lines, emphasis }) => {
  const f = useCurrentFrame();
  return (
    <Zone kind="caption" align="center" gap={6}>
      {lines.map((line, i) => {
        const on = f >= i * LINE_STAGGER ? 1 : 0;
        const settle = ease(f, i * LINE_STAGGER, i * LINE_STAGGER + 4);
        return (
          <div key={i} style={{ opacity: on, transform: `scale(${1.08 - 0.08 * settle})` }}>
            <StrokeText
              stroke={7}
              strokeColor="#000"
              style={{ ...KO, textAlign: 'center', fontFamily: FONT.notoSansKR, fontWeight: 900, fontSize: 72, lineHeight: 1.25, color: '#fff', letterSpacing: '-0.02em' }}
            >
              {splitEmphasis(line, emphasis).map((s, j) => (
                <span key={j} style={s.em ? { color: '#00e5ff' } : undefined}>
                  {s.text}
                </span>
              ))}
            </StrokeText>
          </div>
        );
      })}
    </Zone>
  );
};

export const preset: Preset = {
  meta: {
    id: 'glitch-meme',
    nameKo: '글리치 충격',
    nameEn: 'Glitch Meme',
    mood: 'meme',
    situations: ['밈', '반전', '충격 고백', '후킹'],
    description: '“실화냐” 같은 충격·반전 한마디를 화면이 깨지는 듯한 연출로 꽂을 때 씁니다.',
    inspiredBy: ['https://github.com/av/remotion-bits'],
  },
  Title,
  Caption,
};
