import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Preset } from '../contract';
import { FONT } from '../fonts';
import { CaptionZone, CLAMP, cueOut, EmphasisLine, KOREAN, lineSpring, TitleZone, titleLines } from '../kits/zoneKit';

const GLASS = 'rgba(255,255,255,0.16)';
const EDGE = 'rgba(255,255,255,0.42)';
const INK = '#fffaf2';

const blurIn = (frame: number, start: number, len = 22) => {
  const t = interpolate(frame, [start, start + len], [0, 1], { ...CLAMP, easing: (x) => 1 - Math.pow(1 - x, 2.4) });
  return { opacity: t, filter: `blur(${(1 - t) * 16}px)`, transform: `translateY(${(1 - t) * 12}px)` };
};

const Title: Preset['Title'] = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const panel = lineSpring(frame, fps, 0, { damping: 24, stiffness: 70 });
  return (
    <TitleZone>
      <div style={{ position: 'relative', padding: '46px 64px 52px', borderRadius: 48, background: GLASS,
        backdropFilter: 'blur(28px) saturate(1.3)', WebkitBackdropFilter: 'blur(28px) saturate(1.3)',
        border: `1.5px solid ${EDGE}`, boxShadow: '0 30px 80px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.5)',
        opacity: panel, transform: `scale(${interpolate(panel, [0, 1], [0.96, 1])})` }}>
        {titleLines(text).map((l, i) => (
          <div key={i} style={{ ...KOREAN, textAlign: 'center', fontFamily: FONT.gowunBatang, fontWeight: 700, fontSize: 80,
            lineHeight: 1.32, color: INK, textShadow: '0 2px 18px rgba(40,24,10,0.45)', ...blurIn(frame, 8 + i * 10, 26) }}>
            {l}
          </div>
        ))}
      </div>
    </TitleZone>
  );
};

const Caption: Preset['Caption'] = ({ lines, emphasis, durationInFrames }) => {
  const frame = useCurrentFrame();
  const out = cueOut(frame, durationInFrames, 8);
  return (
    <CaptionZone>
      <div style={{ padding: '22px 44px 26px', borderRadius: 36, background: 'rgba(30,20,12,0.32)',
        backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', border: '1px solid rgba(255,255,255,0.22)',
        opacity: interpolate(frame, [0, 8], [0, 1], CLAMP) * out }}>
        {lines.map((l, i) => (
          <div key={i} style={{ ...KOREAN, textAlign: 'center', fontFamily: FONT.gowunDodum, fontSize: 62, lineHeight: 1.4,
            color: INK, ...blurIn(frame, i * 8, 16) }}>
            <EmphasisLine line={l} emphasis={emphasis} renderEmphasis={(e) => (
              <span style={{ fontFamily: FONT.gowunBatang, fontWeight: 700, color: '#ffe2b8' }}>{e}</span>
            )} />
          </div>
        ))}
      </div>
    </CaptionZone>
  );
};

export const preset: Preset = {
  meta: {
    id: 'soft-glass',
    nameKo: '감성 유리판',
    nameEn: 'Soft Glass',
    mood: 'story',
    situations: ['브이로그', '감성', '사연', '오프닝'],
    description: '반투명 유리판 위로 부드러운 명조가 흐릿하게 맺히며, 잔잔한 이야기를 시작할 때 씁니다.',
    inspiredBy: ['https://github.com/av/remotion-bits', 'https://github.com/vshukla7/remotion-captions-themes'],
  },
  Title,
  Caption,
};
