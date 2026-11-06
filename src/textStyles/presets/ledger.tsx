import React from 'react';
import { useCurrentFrame } from 'remotion';
import type { Preset } from '../contract';
import { FONT } from '../fonts';
import { CaptionZone, KO, TitleZone, ZONE_W, ci, fitSize, splitEmphasis, splitLines } from '../kits/fitKit';

const ACCENT = '#8cc8ff';
const BAND = 'rgba(9, 15, 24, 0.74)';

const Title: Preset['Title'] = ({ text }) => {
  const f = useCurrentFrame();
  const lines = splitLines(text);
  const size = fitSize(lines, 86, ZONE_W - 80, 72);
  return (
    <TitleZone style={{ alignItems: 'flex-start' }}>
      {lines.map((line, i) => {
        const d = i * 6;
        const band = ci(f, [d, d + 14], [0, 1]);
        const txt = ci(f, [d + 4, d + 20], [0, 1]);
        return (
          <div key={i} style={{ position: 'relative', marginBottom: 10, padding: '10px 34px 14px 30px' }}>
            <div style={{ position: 'absolute', inset: 0, background: BAND, borderRadius: 6,
              transform: `scaleX(${band})`, transformOrigin: 'left center', boxShadow: '0 18px 40px rgba(0,0,0,0.25)' }} />
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, background: ACCENT, opacity: band }} />
            <div style={{ position: 'relative', ...KO, fontFamily: FONT.notoSansKR, fontWeight: 800, fontSize: size,
              lineHeight: 1.18, color: '#fff', letterSpacing: '-0.02em', whiteSpace: 'pre-line',
              opacity: txt, transform: `translateY(${(1 - txt) * 26}px)` }}>{line}</div>
          </div>
        );
      })}
    </TitleZone>
  );
};

const Caption: Preset['Caption'] = ({ lines, emphasis }) => {
  const f = useCurrentFrame();
  const size = fitSize(lines, 68, ZONE_W - 60, 48);
  return (
    <CaptionZone style={{ alignItems: 'flex-start' }}>
      {lines.map((line, i) => {
        const p = ci(f, [i * 5, i * 5 + 14], [0, 1]);
        const parts = splitEmphasis(line, emphasis);
        return (
          <div key={i} style={{ background: BAND, borderRadius: 6, padding: '8px 26px 12px', marginBottom: 8,
            opacity: p, transform: `translateY(${(1 - p) * 22}px)`, ...KO,
            fontFamily: FONT.notoSansKR, fontWeight: 700, fontSize: size, lineHeight: 1.25, color: '#fff' }}>
            {parts ? (<>{parts.pre}<span style={{ color: ACCENT }}>{parts.em}</span>{parts.post}</>) : line}
          </div>
        );
      })}
    </CaptionZone>
  );
};

export const preset: Preset = {
  meta: {
    id: 'ledger',
    nameKo: '신뢰 밴드',
    nameEn: 'Ledger Band',
    mood: 'trust',
    situations: ['후기', '인증', '설명', '브랜드 소개'],
    description: '근거나 인증 사실을 차분하게 전달할 때, 어떤 배경에서도 읽히는 어두운 띠 위에 담백하게 올립니다.',
    inspiredBy: ['https://github.com/vshukla7/remotion-captions-themes', 'https://github.com/ahgsql/remotion-subtitles'],
  },
  Title,
  Caption,
};
