import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import type { Preset } from '../contract';
import { FONT } from '../fonts';
import { CaptionZone, CLAMP, cueOut, EmphasisLine, KOREAN, TitleZone, titleLines } from '../kits/zoneKit';

const BAR = 168; // px; bars sit in the unsafe top/bottom strips, never under text
const ease = (x: number) => 1 - Math.pow(1 - x, 3);

const Title: Preset['Title'] = ({ text }) => {
  const frame = useCurrentFrame();
  const bars = interpolate(frame, [0, 20], [0, 1], { ...CLAMP, easing: ease });
  const scrim = interpolate(frame, [6, 30], [0, 1], CLAMP);
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: BAR, background: '#000',
        transform: `scaleY(${bars})`, transformOrigin: 'top' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: BAR, background: '#000',
        transform: `scaleY(${bars})`, transformOrigin: 'bottom' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: BAR, height: 520, opacity: scrim * 0.85,
        background: 'linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0))' }} />
      <TitleZone>
        {titleLines(text).map((l, i) => {
          const t = interpolate(frame, [14 + i * 14, 44 + i * 14], [0, 1], { ...CLAMP, easing: ease });
          return (
            <div key={i} style={{ ...KOREAN, textAlign: 'center', fontFamily: FONT.notoSansKR, fontWeight: i === 0 ? 300 : 500,
              fontSize: i === 0 ? 60 : 66, lineHeight: 1.6, letterSpacing: '0.28em', marginRight: '-0.28em', color: '#f4efe6',
              textShadow: '0 2px 20px rgba(0,0,0,0.6)', opacity: t, transform: `scale(${1.06 - t * 0.06})` }}>
              {l}
            </div>
          );
        })}
        <div style={{ marginTop: 22, width: 64, height: 2, background: 'rgba(244,239,230,0.7)',
          transform: `scaleX(${interpolate(frame, [36, 60], [0, 1], { ...CLAMP, easing: ease })})` }} />
      </TitleZone>
    </AbsoluteFill>
  );
};

const Caption: Preset['Caption'] = ({ lines, emphasis, durationInFrames }) => {
  const frame = useCurrentFrame();
  const out = cueOut(frame, durationInFrames, 8);
  return (
    <CaptionZone justify="flex-end">
      {lines.map((l, i) => (
        <div key={i} style={{ ...KOREAN, textAlign: 'center', fontFamily: FONT.notoSansKR, fontWeight: 500, fontSize: 58,
          lineHeight: 1.45, letterSpacing: 0.5, color: '#fff', textShadow: '0 0 4px rgba(0,0,0,0.95), 0 3px 12px rgba(0,0,0,0.8)',
          opacity: interpolate(frame, [i * 6, i * 6 + 10], [0, 1], CLAMP) * out }}>
          <EmphasisLine line={l} emphasis={emphasis} renderEmphasis={(e) => <span style={{ color: '#ffd98a' }}>{e}</span>} />
        </div>
      ))}
    </CaptionZone>
  );
};

export const preset: Preset = {
  meta: {
    id: 'letterbox-story',
    nameKo: '시네마 레터박스',
    nameEn: 'Letterbox Story',
    mood: 'story',
    situations: ['오프닝', '사연', '비포애프터', '브랜드필름'],
    description: '영화처럼 위아래 검은 띠가 내려오고 넓은 자간의 제목이 떠올라, 이야기형 광고를 열 때 씁니다.',
    inspiredBy: ['https://github.com/reactvideoeditor/remotion-templates'],
  },
  Title,
  Caption,
};
