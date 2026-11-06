import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Preset } from '../contract';
import { FONT } from '../fonts';
import { CaptionZone, CLAMP, cueOut, EmphasisLine, KOREAN, lineSpring, TitleZone, titleLines } from '../kits/zoneKit';

const NAVY = '#101826';
const LIME = '#c6f432';
const SEGMENTS = 3;

const Title: Preset['Title'] = ({ text, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const card = lineSpring(frame, fps, 0, { damping: 20, stiffness: 120 });
  const progress = interpolate(frame, [10, Math.max(11, durationInFrames - 10)], [0, 1], CLAMP);
  return (
    <TitleZone>
      <div style={{ width: '100%', background: NAVY, borderRadius: 8, padding: '34px 44px 30px', boxShadow: '0 28px 70px rgba(0,0,0,0.35)',
        opacity: card, transform: `translateY(${(1 - card) * 30}px)` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14,
          opacity: interpolate(frame, [6, 16], [0, 1], CLAMP) }}>
          <div style={{ fontFamily: FONT.ibmPlexSansKR, fontWeight: 700, fontSize: 30, letterSpacing: 6, color: LIME }}>CHAPTER 01</div>
          <div style={{ fontFamily: FONT.ibmPlexSansKR, fontSize: 28, color: 'rgba(255,255,255,0.55)', fontVariantNumeric: 'tabular-nums' }}>
            {String(Math.round(progress * 100)).padStart(2, '0')}%
          </div>
        </div>
        {titleLines(text).map((l, i) => {
          const p = lineSpring(frame, fps, i, { delay: 8, stagger: 6 });
          return (
            <div key={i} style={{ ...KOREAN, fontFamily: FONT.notoSansKR, fontWeight: 800, fontSize: 80, lineHeight: 1.2, color: '#fff',
              letterSpacing: -2.5, opacity: p, clipPath: `inset(0 0 ${(1 - p) * 100}% 0)`, transform: `translateY(${(1 - p) * 20}px)` }}>
              {l}
            </div>
          );
        })}
        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          {Array.from({ length: SEGMENTS }, (_, k) => {
            const fill = Math.min(1, Math.max(0, progress * SEGMENTS - k));
            return (
              <div key={k} style={{ flex: 1, height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.16)', overflow: 'hidden' }}>
                <div style={{ width: '100%', height: '100%', background: LIME, transform: `scaleX(${fill})`, transformOrigin: 'left' }} />
              </div>
            );
          })}
        </div>
      </div>
    </TitleZone>
  );
};

const Caption: Preset['Caption'] = ({ lines, emphasis, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const out = cueOut(frame, durationInFrames, 5);
  const box = lineSpring(frame, fps, 0, { damping: 22, stiffness: 160 });
  return (
    <CaptionZone>
      <div style={{ background: '#fff', border: `4px solid ${NAVY}`, borderRadius: 8, padding: '18px 36px 22px',
        boxShadow: `8px 8px 0 ${NAVY}`, opacity: box * out, transform: `translateY(${(1 - box) * 16}px)` }}>
        {lines.map((l, i) => {
          const p = interpolate(frame, [3 + i * 6, 11 + i * 6], [0, 1], CLAMP);
          return (
            <div key={i} style={{ ...KOREAN, textAlign: 'center', fontFamily: FONT.notoSansKR, fontWeight: 700, fontSize: 60,
              lineHeight: 1.35, color: NAVY, opacity: p, transform: `translateY(${(1 - p) * 8}px)` }}>
              <EmphasisLine line={l} emphasis={emphasis} renderEmphasis={(e) => (
                <span style={{ background: LIME, padding: '0 10px', borderRadius: 4, fontWeight: 900 }}>{e}</span>
              )} />
            </div>
          );
        })}
      </div>
    </CaptionZone>
  );
};

export const preset: Preset = {
  meta: {
    id: 'chapter-card',
    nameKo: '챕터 카드',
    nameEn: 'Chapter Card',
    mood: 'info',
    situations: ['정보전달', '목차', '튜토리얼', '비교'],
    description: '챕터 번호와 진행 막대가 있는 카드로, 긴 정보를 구간별로 나눠 보여줄 때 씁니다.',
    inspiredBy: ['https://github.com/reactvideoeditor/remotion-templates', 'https://github.com/vshukla7/remotion-captions-themes'],
  },
  Title,
  Caption,
};
