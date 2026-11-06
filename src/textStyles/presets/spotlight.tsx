import React from 'react';
import { AbsoluteFill, Easing, useCurrentFrame } from 'remotion';
import type { Preset } from '../contract';
import { SAFE } from '../contract';
import { FONT } from '../fonts';
import { CaptionZone, KO, TitleZone, ZONE_W, ci, fitSize, splitEmphasis, splitLines } from '../kits/fitKit';

const sweep = Easing.bezier(0.5, 0, 0.25, 1);

const Title: Preset['Title'] = ({ text }) => {
  const f = useCurrentFrame();
  const lines = splitLines(text);
  const size = fitSize(lines, 112, ZONE_W - 60, 72);
  // Spotlight travels across the title, then opens up to reveal all of it.
  const x = ci(f, [0, 46], [-15, 85], sweep); // % of zone width
  const radius = ci(f, [40, 72], [210, 1300], sweep);
  const vignette = ci(f, [0, 20], [0, 1]);
  const beam = ci(f, [50, 80], [1, 0.25]);
  const cy = (SAFE.titleTop + SAFE.titleBottom) / 2;
  const mask = `radial-gradient(circle ${radius}px at ${x}% 50%, #000 55%, transparent 100%)`;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: vignette,
        background: 'radial-gradient(ellipse 85% 60% at 50% 45%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.78) 100%)' }} />
      {/* warm light pool following the spot */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: cy - 420, height: 840, mixBlendMode: 'screen', opacity: beam,
        background: `radial-gradient(circle 340px at ${SAFE.x + (ZONE_W * x) / 100}px 50%, rgba(255,232,190,0.38), rgba(255,232,190,0) 100%)` }} />
      <TitleZone>
        <div style={{ WebkitMaskImage: mask, maskImage: mask, padding: '20px 30px' }}>
          <div style={{ ...KO, whiteSpace: 'pre-line', fontFamily: FONT.songMyung, fontSize: size, lineHeight: 1.22, color: '#fbf6ec',
            textAlign: 'center', letterSpacing: '0.02em', textShadow: '0 4px 30px rgba(0,0,0,0.8), 0 1px 2px rgba(0,0,0,0.9)' }}>{text}</div>
        </div>
      </TitleZone>
    </AbsoluteFill>
  );
};

const Caption: Preset['Caption'] = ({ lines, emphasis }) => {
  const f = useCurrentFrame();
  const size = fitSize(lines, 58, ZONE_W - 80, 48, 0.08);
  return (
    <CaptionZone>
      {lines.map((line, i) => {
        const p = ci(f, [i * 9, i * 9 + 20], [0, 1]);
        const parts = splitEmphasis(line, emphasis);
        return (
          <div key={i} style={{ ...KO, fontFamily: FONT.gowunDodum, fontSize: size, lineHeight: 1.5, letterSpacing: '0.08em',
            color: '#fff', textAlign: 'center', opacity: p, filter: `brightness(${0.3 + 0.7 * p})`,
            textShadow: '0 0 2px rgba(0,0,0,0.9), 0 2px 18px rgba(0,0,0,0.8)' }}>
            {parts ? (<>{parts.pre}<span style={{ color: '#ffe3ad', borderBottom: '1px solid rgba(255,227,173,0.7)' }}>{parts.em}</span>{parts.post}</>) : line}
          </div>
        );
      })}
    </CaptionZone>
  );
};

export const preset: Preset = {
  meta: {
    id: 'spotlight',
    nameKo: '스포트라이트',
    nameEn: 'Spotlight',
    mood: 'luxury',
    situations: ['신제품 공개', '프리미엄', '티저', '런칭'],
    description: '신제품을 처음 공개하는 순간에, 어둠 속 조명이 지나가며 제목을 드러내 기대감을 만듭니다.',
    inspiredBy: ['https://github.com/reactvideoeditor/remotion-templates'],
  },
  Title,
  Caption,
};
