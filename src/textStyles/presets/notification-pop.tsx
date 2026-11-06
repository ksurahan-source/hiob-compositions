import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Preset } from '../contract';
import { FONT } from '../fonts';
import { CaptionZone, KO, TitleZone, ZONE_W, ci, fitSize, splitEmphasis, splitLines } from '../kits/fitKit';

const CARD_W = ZONE_W - 20;

const AppIcon: React.FC = () => (
  <div style={{ width: 58, height: 58, borderRadius: 15, background: 'linear-gradient(135deg, #ff7a45, #ff2d55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.15)' }}>
    <svg width={30} height={30} viewBox="0 0 30 30"><path d="M6 11 h18 l-2 13 H8 Z M10 11 a5 5 0 0 1 10 0" fill="none"
      stroke="#fff" strokeWidth={3} strokeLinejoin="round" /></svg>
  </div>
);

const Title: Preset['Title'] = ({ text }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines = splitLines(text);
  const size = fitSize(lines, 76, CARD_W - 80, 72);
  const s = spring({ frame: f, fps, config: { damping: 14, stiffness: 150 } });
  const back = spring({ frame: f - 8, fps, config: { damping: 16, stiffness: 120 } });
  const tick = ci(f, [12, 22], [0, 1]);
  return (
    <TitleZone style={{ justifyContent: 'flex-start', paddingTop: 10, clipPath: 'inset(-20px -90px -120px -90px)' }}>
      <div style={{ position: 'relative', width: CARD_W, transform: `translateY(${(1 - s) * -150}px)`, opacity: ci(f, [0, 8], [0, 1]) }}>
        {/* stacked notification behind for depth */}
        <div style={{ position: 'absolute', left: 30, right: 30, bottom: -22, height: 60, borderRadius: 36,
          background: 'rgba(235,235,240,0.55)', transform: `translateY(${(1 - back) * -30}px)`, opacity: back }} />
        <div style={{ position: 'relative', background: 'rgba(246,246,248,0.92)', backdropFilter: 'blur(26px)', borderRadius: 44,
          padding: '24px 34px 30px', boxShadow: '0 26px 60px rgba(0,0,0,0.35)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
            <AppIcon />
            <div style={{ flex: 1, fontFamily: FONT.notoSansKR, fontWeight: 600, fontSize: 28, color: '#55585f', letterSpacing: '0.02em' }}>쇼핑 알림</div>
            <div style={{ fontFamily: FONT.notoSansKR, fontSize: 26, color: '#8b8e95', opacity: tick }}>지금</div>
          </div>
          <div style={{ ...KO, whiteSpace: 'pre-line', fontFamily: FONT.notoSansKR, fontWeight: 800, fontSize: size, lineHeight: 1.2,
            color: '#121317', letterSpacing: '-0.03em' }}>{text}</div>
        </div>
      </div>
    </TitleZone>
  );
};

const Caption: Preset['Caption'] = ({ lines, emphasis }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const size = fitSize(lines, 64, ZONE_W - 110, 48);
  return (
    <CaptionZone style={{ alignItems: 'center', gap: 12 }}>
      {lines.map((line, i) => {
        const s = spring({ frame: f - i * 6, fps, config: { damping: 15, stiffness: 170 } });
        const parts = splitEmphasis(line, emphasis);
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, background: 'rgba(18,18,22,0.84)',
            backdropFilter: 'blur(14px)', borderRadius: 26, padding: '10px 30px 14px 22px', opacity: Math.min(1, s * 1.5),
            transform: `translateY(${(1 - s) * -24}px)`, boxShadow: '0 12px 28px rgba(0,0,0,0.3)' }}>
            <div style={{ width: 16, height: 16, borderRadius: 8, background: i === 0 ? '#ff3b5c' : '#3a3d45', flexShrink: 0 }} />
            <div style={{ ...KO, fontFamily: FONT.notoSansKR, fontWeight: 700, fontSize: size, lineHeight: 1.25, color: '#fff' }}>
              {parts ? (<>{parts.pre}<span style={{ color: '#ffb340' }}>{parts.em}</span>{parts.post}</>) : line}
            </div>
          </div>
        );
      })}
    </CaptionZone>
  );
};

export const preset: Preset = {
  meta: {
    id: 'notification-pop',
    nameKo: '푸시 알림',
    nameEn: 'Notification Pop',
    mood: 'urgent',
    situations: ['CTA', '할인', '재입고', '이벤트 공지'],
    description: '혜택이나 행동 유도를 알려줄 때, 휴대폰 알림이 내려오듯 자연스럽게 시선을 끌어당깁니다.',
    inspiredBy: ['https://github.com/reactvideoeditor/remotion-templates'],
  },
  Title,
  Caption,
};
