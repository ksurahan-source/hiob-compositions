import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Preset } from '../contract';
import { FONT } from '../fonts';
import { CaptionZone, cueOut, EmphasisLine, KOREAN, lineSpring, outline, TitleZone, titleLines } from '../kits/zoneKit';

const STROKE = '#2a0f45';
const FILLS = ['#ffffff', '#c8ff2e'];
const SHADOW = '#ff4fa3';

const Title: Preset['Title'] = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <TitleZone>
      {titleLines(text).map((l, i) => {
        const s = lineSpring(frame, fps, i, { stagger: 8, damping: 7, stiffness: 180, mass: 0.7 });
        const squash = interpolate(s, [0, 0.7, 1, 1.15], [0.2, 1.12, 1, 0.94], { extrapolateRight: 'clamp' });
        const wobble = Math.sin((frame - i * 8) / 7) * 1.2;
        return (
          <div key={i} style={{ ...KOREAN, textAlign: 'center', fontFamily: FONT.jua, fontSize: i === 0 ? 112 : 128, lineHeight: 1.12,
            color: FILLS[i % FILLS.length], ...outline(22, STROKE), textShadow: `0 12px 0 ${SHADOW}, 0 14px 0 ${STROKE}`,
            opacity: Math.min(1, s * 3), transform: `translateY(${(1 - s) * 90}px) scale(${squash}) rotate(${(i % 2 ? 2 : -2) + wobble}deg)` }}>
            {l}
          </div>
        );
      })}
    </TitleZone>
  );
};

const Caption: Preset['Caption'] = ({ lines, emphasis, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const out = cueOut(frame, durationInFrames, 4);
  return (
    <CaptionZone>
      {lines.map((l, i) => {
        const s = lineSpring(frame, fps, i, { stagger: 6, damping: 9, stiffness: 220, mass: 0.6 });
        return (
          <div key={i} style={{ ...KOREAN, textAlign: 'center', fontFamily: FONT.jua, fontSize: 76, lineHeight: 1.25, color: '#fff',
            ...outline(14, STROKE), textShadow: `0 6px 0 ${STROKE}`, opacity: Math.min(1, s * 3) * out,
            transform: `scale(${interpolate(s, [0, 1], [0.4, 1])})` }}>
            <EmphasisLine line={l} emphasis={emphasis} renderEmphasis={(e) => <span style={{ color: FILLS[1] }}>{e}</span>} />
          </div>
        );
      })}
    </CaptionZone>
  );
};

export const preset: Preset = {
  meta: {
    id: 'bounce-pop',
    nameKo: '통통 팝',
    nameEn: 'Bounce Pop',
    mood: 'meme',
    situations: ['유머', '밈', '리액션', '챌린지'],
    description: '두꺼운 외곽선의 동글한 글씨가 통통 튀어 들어와, 가볍고 웃긴 장면을 살릴 때 씁니다.',
    inspiredBy: ['https://github.com/ahgsql/remotion-subtitles'],
  },
  Title,
  Caption,
};
