import React from 'react';
import { Easing, useCurrentFrame } from 'remotion';
import type { Preset } from '../contract';
import { FONT } from '../fonts';
import { CaptionZone, KO, TitleZone, ZONE_W, ci, fitSize, splitEmphasis, splitLines } from '../kits/fitKit';

const GOLD = 'linear-gradient(180deg, #fff1c9 0%, #e7c27a 42%, #b8873c 70%, #f1d38e 100%)';
const GOLD_SOLID = '#e2bd74';
const slow = Easing.bezier(0.33, 0, 0.15, 1);

const Title: Preset['Title'] = ({ text }) => {
  const f = useCurrentFrame();
  const lines = splitLines(text);
  const size = fitSize(lines, 96, ZONE_W - 80, 72, 0.06);
  const fade = ci(f, [0, 40], [0, 1], slow);
  const line = ci(f, [26, 66], [0, 1], slow);
  const gem = ci(f, [56, 72], [0, 1], slow);
  return (
    <TitleZone>
      <div style={{ ...KO, whiteSpace: 'pre-line', fontFamily: FONT.nanumMyeongjo, fontWeight: 800, fontSize: size, lineHeight: 1.28,
        letterSpacing: '0.06em', textAlign: 'center', backgroundImage: GOLD, WebkitBackgroundClip: 'text', backgroundClip: 'text',
        color: 'transparent', opacity: fade, transform: `translateY(${(1 - fade) * 18}px)`,
        filter: 'drop-shadow(0 3px 2px rgba(0,0,0,0.7)) drop-shadow(0 10px 30px rgba(0,0,0,0.55))' }}>{text}</div>
      <div style={{ position: 'relative', width: 520, height: 20, marginTop: 26, display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 9, height: 2,
          background: `linear-gradient(90deg, transparent, ${GOLD_SOLID} 20%, #fff3cf 50%, ${GOLD_SOLID} 80%, transparent)`,
          transform: `scaleX(${line})`, boxShadow: '0 1px 3px rgba(0,0,0,0.6)' }} />
        <div style={{ position: 'absolute', left: '50%', top: 2, width: 16, height: 16, marginLeft: -8, background: '#f3d692',
          transform: `rotate(45deg) scale(${gem})`, boxShadow: '0 0 12px rgba(255,220,150,0.8)' }} />
      </div>
    </TitleZone>
  );
};

const Caption: Preset['Caption'] = ({ lines, emphasis }) => {
  const f = useCurrentFrame();
  const size = fitSize(lines, 60, ZONE_W - 60, 48, 0.04);
  return (
    <CaptionZone>
      {lines.map((line, i) => {
        const p = ci(f, [i * 10, i * 10 + 24], [0, 1], slow);
        const parts = splitEmphasis(line, emphasis);
        return (
          <div key={i} style={{ ...KO, fontFamily: FONT.nanumMyeongjo, fontWeight: 700, fontSize: size, lineHeight: 1.45,
            letterSpacing: '0.04em', color: '#f6eedd', textAlign: 'center', opacity: p,
            textShadow: '0 2px 3px rgba(0,0,0,0.85), 0 0 24px rgba(0,0,0,0.6)' }}>
            {parts ? (<>{parts.pre}<span style={{ color: GOLD_SOLID }}>{parts.em}</span>{parts.post}</>) : line}
          </div>
        );
      })}
    </CaptionZone>
  );
};

export const preset: Preset = {
  meta: {
    id: 'gold-serif',
    nameKo: '골드 명조',
    nameEn: 'Gold Serif',
    mood: 'luxury',
    situations: ['프리미엄', '브랜드 소개', '신제품', '선물'],
    description: '고급스러운 브랜드 메시지를 전할 때, 금빛 명조와 천천히 그어지는 실선으로 품격을 더합니다.',
    inspiredBy: ['https://github.com/reactvideoeditor/remotion-templates', 'https://github.com/vshukla7/remotion-captions-themes'],
  },
  Title,
  Caption,
};
