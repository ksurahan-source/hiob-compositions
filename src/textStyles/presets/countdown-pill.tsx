import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Preset } from '../contract';
import { FONT } from '../fonts';
import { CaptionZone, KO, TitleZone, ZONE_W, ci, fitSize, splitEmphasis, splitLines } from '../kits/fitKit';

const RED = '#e8202a';
const PULSE = 30; // frames per ring cycle

const Ring: React.FC<{ f: number; offset: number }> = ({ f, offset }) => {
  const t = (((f + offset) % PULSE) + PULSE) % PULSE / PULSE;
  return (
    <div style={{ position: 'absolute', inset: 0, borderRadius: 999, border: `6px solid ${RED}`,
      transform: `scale(${1 + t * 0.22}, ${1 + t * 0.5})`, opacity: (1 - t) * 0.8 }} />
  );
};

const Title: Preset['Title'] = ({ text }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines = splitLines(text);
  const head = lines.slice(0, -1).join(' ');
  const main = lines[lines.length - 1];
  const mainSize = fitSize([main], 104, ZONE_W - 140, 72);
  const headSize = fitSize([head], 72, ZONE_W - 120, 72);
  const a = spring({ frame: f, fps, config: { damping: 12, stiffness: 180 } });
  const b = spring({ frame: f - 6, fps, config: { damping: 10, stiffness: 200 } });
  const ringsOn = ci(f, [14, 20], [0, 1]);
  const beat = 1 + Math.max(0, Math.sin(((f - 14) / PULSE) * Math.PI * 2)) * 0.025 * ringsOn;
  return (
    <TitleZone style={{ gap: 22 }}>
      {head ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: '#fff', borderRadius: 999, padding: '6px 34px 10px 26px',
          transform: `scale(${a})`, boxShadow: '0 12px 30px rgba(0,0,0,0.3)' }}>
          <div style={{ width: 22, height: 22, borderRadius: 11, background: RED, opacity: 0.4 + 0.6 * Math.abs(Math.cos(f / 8)) }} />
          <div style={{ ...KO, fontFamily: FONT.notoSansKR, fontWeight: 900, fontSize: headSize, lineHeight: 1.15, color: RED,
            letterSpacing: '-0.03em' }}>{head}</div>
        </div>
      ) : null}
      <div style={{ position: 'relative', transform: `scale(${b * beat})` }}>
        {ringsOn > 0 ? (<><Ring f={f - 14} offset={0} /><Ring f={f - 14} offset={PULSE / 2} /></>) : null}
        <div style={{ position: 'relative', background: `linear-gradient(180deg, #ff3b3b, ${RED} 60%, #b8121a)`, borderRadius: 999,
          padding: '6px 56px 14px', boxShadow: '0 20px 44px rgba(140,0,10,0.45), inset 0 3px 0 rgba(255,255,255,0.35)' }}>
          <div style={{ ...KO, whiteSpace: 'pre-line', fontFamily: FONT.notoSansKR, fontWeight: 900, fontSize: mainSize, lineHeight: 1.15,
            color: '#fff', letterSpacing: '-0.04em' }}>{main}</div>
        </div>
      </div>
    </TitleZone>
  );
};

const Caption: Preset['Caption'] = ({ lines, emphasis }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const size = fitSize(lines, 66, ZONE_W - 90, 48);
  return (
    <CaptionZone style={{ gap: 14 }}>
      {lines.map((line, i) => {
        const s = spring({ frame: f - i * 5, fps, config: { damping: 13, stiffness: 200 } });
        const parts = splitEmphasis(line, emphasis);
        return (
          <div key={i} style={{ ...KO, background: '#fff', borderRadius: 999, padding: '6px 36px 10px', fontFamily: FONT.notoSansKR,
            fontWeight: 800, fontSize: size, lineHeight: 1.25, color: '#111', transform: `scale(${0.7 + 0.3 * s})`,
            opacity: Math.min(1, s * 1.6), boxShadow: '0 10px 26px rgba(0,0,0,0.3)' }}>
            {parts ? (<>{parts.pre}<span style={{ color: RED }}>{parts.em}</span>{parts.post}</>) : line}
          </div>
        );
      })}
    </CaptionZone>
  );
};

export const preset: Preset = {
  meta: {
    id: 'countdown-pill',
    nameKo: '마감 알약',
    nameEn: 'Countdown Pill',
    mood: 'urgent',
    situations: ['마감 임박', '타임세일', '할인', '재고 소진'],
    description: '마감 시간이나 수량 한정을 알릴 때, 맥박처럼 뛰는 빨간 알약으로 지금 사야 할 이유를 보여줍니다.',
    inspiredBy: ['https://github.com/vshukla7/remotion-captions-themes', 'https://github.com/reactvideoeditor/remotion-templates'],
  },
  Title,
  Caption,
};
