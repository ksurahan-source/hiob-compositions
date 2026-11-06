import React from 'react';
import { useCurrentFrame } from 'remotion';
import type { Preset } from '../contract';
import { FONT } from '../fonts';
import { CaptionZone, KO, TitleZone, ZONE_W, ci, fitSize, splitEmphasis, splitLines } from '../kits/fitKit';

const MARKER = '#ffe53b';
const SWIPE_DELAY = 12; // marker starts after the line has appeared
const SWIPE_DUR = 12;

// Marker swipe behind a whole phrase; text flips to dark exactly where the marker has passed.
const Marked: React.FC<{ text: string; p: number; color: string; lightText: string; darkText: string }> = ({ text, p, color, lightText, darkText }) => (
  <span style={{ position: 'relative', display: 'inline-block', padding: '0 8px', margin: '0 2px' }}>
    <span style={{ position: 'absolute', left: 0, right: 0, top: '12%', bottom: '4%', background: color, borderRadius: '6px 14px 8px 12px',
      transform: `scaleX(${p}) skewX(-6deg)`, transformOrigin: 'left center' }} />
    <span style={{ position: 'relative', color: lightText, clipPath: `inset(-20% -20% -20% ${p * 100}%)` }}>{text}</span>
    <span style={{ position: 'absolute', left: 8, top: 0, color: darkText, textShadow: 'none', clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` }}>{text}</span>
  </span>
);

const Title: Preset['Title'] = ({ text }) => {
  const f = useCurrentFrame();
  const lines = splitLines(text);
  const size = fitSize(lines, 94, ZONE_W - 60, 72);
  return (
    <TitleZone>
      {lines.map((line, i) => {
        const at = i * 8;
        const p = ci(f, [at, at + 16], [0, 1]);
        return (
          <div key={i} style={{ position: 'relative', margin: '4px 0', padding: '0 24px 6px' }}>
            <div style={{ position: 'absolute', left: -6, right: -6, top: '14%', bottom: '2%', background: MARKER,
              borderRadius: '8px 26px 10px 22px', transform: `scaleX(${p}) rotate(${i % 2 ? 0.9 : -1.1}deg) skewX(-8deg)`,
              transformOrigin: 'left center', boxShadow: '0 10px 26px rgba(0,0,0,0.22)' }} />
            <div style={{ position: 'relative', ...KO, whiteSpace: 'pre-line', fontFamily: FONT.notoSansKR, fontWeight: 900, fontSize: size,
              lineHeight: 1.2, color: '#111', letterSpacing: '-0.04em', opacity: ci(f, [at + 6, at + 14], [0, 1]) }}>{line}</div>
          </div>
        );
      })}
    </TitleZone>
  );
};

const Caption: Preset['Caption'] = ({ lines, emphasis }) => {
  const f = useCurrentFrame();
  const size = fitSize(lines, 70, ZONE_W - 30, 48);
  return (
    <CaptionZone>
      {lines.map((line, i) => {
        const at = i * 5;
        const p = ci(f, [at, at + 10], [0, 1]);
        const swipe = ci(f, [at + SWIPE_DELAY, at + SWIPE_DELAY + SWIPE_DUR], [0, 1]);
        const parts = splitEmphasis(line, emphasis);
        return (
          <div key={i} style={{ ...KO, fontFamily: FONT.notoSansKR, fontWeight: 800, fontSize: size, lineHeight: 1.36, color: '#fff',
            textAlign: 'center', opacity: p, transform: `translateY(${(1 - p) * 14}px)`, letterSpacing: '-0.02em',
            textShadow: '0 0 3px rgba(0,0,0,0.9), 0 3px 6px rgba(0,0,0,0.6), 0 6px 22px rgba(0,0,0,0.5)' }}>
            {parts ? (
              <>{parts.pre}<Marked text={parts.em} p={swipe} color={MARKER} lightText="#fff" darkText="#111" />{parts.post}</>
            ) : line}
          </div>
        );
      })}
    </CaptionZone>
  );
};

export const preset: Preset = {
  meta: {
    id: 'highlight-marker',
    nameKo: '형광펜 강조',
    nameEn: 'Highlight Marker',
    mood: 'info',
    situations: ['핵심 요약', '정보', '꿀팁', '비교'],
    description: '꼭 기억시킬 핵심 문구가 있을 때, 줄이 나온 뒤 형광펜이 그 구절 전체를 한 번 그어 줍니다.',
    inspiredBy: ['https://github.com/reactvideoeditor/remotion-templates', 'https://github.com/vshukla7/remotion-captions-themes'],
  },
  Title,
  Caption,
};
