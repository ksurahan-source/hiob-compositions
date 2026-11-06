import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Preset } from '../contract';
import { FONT } from '../fonts';
import { CaptionZone, KO, TitleZone, ZONE_W, ci, fitSize, splitEmphasis, splitLines, stroke } from '../kits/fitKit';

const YELLOW = '#ffe03a';
const RED = '#ff2d2d';
const BARS = [{ bg: YELLOW, fg: '#0d0d0d', rot: -3 }, { bg: RED, fg: '#fff', rot: 2 }];

// Decaying shake after impact (deterministic).
const shake = (f: number, at: number): number => {
  const t = f - at;
  if (t < 0) return 0;
  return Math.sin(t * 2.6) * 14 * Math.exp(-t / 5);
};

const Title: Preset['Title'] = ({ text }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines = splitLines(text);
  const size = fitSize(lines, 112, ZONE_W - 80, 72);
  return (
    <TitleZone>
      {lines.map((line, i) => {
        const bar = BARS[i % BARS.length];
        const at = i * 7;
        const s = spring({ frame: f - at, fps, config: { damping: 7, stiffness: 220, mass: 0.7 } });
        const dx = shake(f, at + 6);
        return (
          <div key={i} style={{ background: bar.bg, padding: '2px 30px 10px', margin: '6px 0',
            transform: `translateX(${dx}px) scale(${1.5 - 0.5 * s}) rotate(${bar.rot}deg)`,
            opacity: Math.min(1, s * 2), boxShadow: '10px 12px 0 rgba(0,0,0,0.85)' }}>
            <div style={{ ...KO, whiteSpace: 'pre-line', fontFamily: FONT.blackHanSans, fontSize: size, lineHeight: 1.12,
              color: bar.fg, letterSpacing: '-0.01em' }}>{line}</div>
          </div>
        );
      })}
    </TitleZone>
  );
};

const Caption: Preset['Caption'] = ({ lines, emphasis }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const size = fitSize(lines, 78, ZONE_W - 20, 48);
  return (
    <CaptionZone>
      {lines.map((line, i) => {
        const s = spring({ frame: f - i * 5, fps, config: { damping: 9, stiffness: 240 } });
        const parts = splitEmphasis(line, emphasis);
        return (
          <div key={i} style={{ ...KO, fontFamily: FONT.blackHanSans, fontSize: size, lineHeight: 1.3, color: '#fff', ...stroke(12),
            textAlign: 'center', transform: `scale(${1.5 - 0.5 * s})`, opacity: Math.min(1, s * 2),
            filter: 'drop-shadow(0 6px 0 rgba(0,0,0,0.6))' }}>
            {parts ? (
              <>{parts.pre}<span style={{ background: YELLOW, color: '#0d0d0d', WebkitTextStroke: '0px', padding: '0 12px',
                margin: '0 4px', display: 'inline-block', transform: 'rotate(-2deg)' }}>{parts.em}</span>{parts.post}</>
            ) : line}
          </div>
        );
      })}
    </CaptionZone>
  );
};

export const preset: Preset = {
  meta: {
    id: 'slam-bar',
    nameKo: '쾅 박스',
    nameEn: 'Slam Bar',
    mood: 'urgent',
    situations: ['할인', '마감 임박', '오프닝', '이벤트'],
    description: '할인·마감처럼 첫 1초에 시선을 붙잡아야 할 때, 노란·빨간 박스가 쾅 떨어지며 흔들립니다.',
    inspiredBy: ['https://github.com/ahgsql/remotion-subtitles', 'https://github.com/av/remotion-bits'],
  },
  Title,
  Caption,
};
