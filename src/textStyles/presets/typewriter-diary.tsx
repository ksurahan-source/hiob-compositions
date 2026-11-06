import React from 'react';
import { useCurrentFrame } from 'remotion';
import type { Preset } from '../contract';
import { FONT } from '../fonts';
import { CaptionZone, KO, TitleZone, ZONE_W, ci, fitSize, splitEmphasis, splitLines } from '../kits/fitKit';

const PAPER = '#f7eedc';
const INK = '#3a2717';
const FRAMES_PER_SYLLABLE = 3;
const TYPE_START = 8;

const Title: Preset['Title'] = ({ text }) => {
  const f = useCurrentFrame();
  const lines = splitLines(text);
  const size = fitSize(lines, 96, ZONE_W - 150, 72);
  const card = ci(f, [0, 12], [0, 1]);
  // One Hangul syllable (code point) at a time; spaces/newlines are free.
  const chars = Array.from(text);
  let budget = Math.max(0, Math.floor((f - TYPE_START) / FRAMES_PER_SYLLABLE));
  let shown = 0;
  while (shown < chars.length && (budget > 0 || /\s/.test(chars[shown]))) {
    if (!/\s/.test(chars[shown])) budget -= 1;
    shown += 1;
  }
  const done = shown >= chars.length;
  const caretOn = done ? Math.floor(f / 15) % 2 === 0 : true;
  return (
    <TitleZone>
      <div style={{ position: 'relative', width: ZONE_W - 60, background: PAPER, borderRadius: 10, padding: '30px 50px 34px',
        transform: `rotate(-1.6deg) translateY(${(1 - card) * 24}px)`, opacity: card,
        boxShadow: '0 24px 50px rgba(40,20,5,0.35), 0 2px 0 rgba(0,0,0,0.06)',
        backgroundImage: `repeating-linear-gradient(180deg, transparent 0 ${size * 1.3 - 2}px, rgba(160,120,80,0.22) ${size * 1.3 - 2}px ${size * 1.3}px)`,
        backgroundPosition: '0 30px' }}>
        {/* washi tape */}
        <div style={{ position: 'absolute', top: -20, left: '50%', width: 170, height: 42, marginLeft: -85,
          background: 'rgba(232,170,120,0.75)', transform: 'rotate(3deg)' }} />
        <div style={{ fontFamily: FONT.gowunBatang, fontWeight: 700, fontSize: 26, color: '#9b7a5a', letterSpacing: '0.2em', marginBottom: 4 }}>DIARY</div>
        <div style={{ ...KO, whiteSpace: 'pre-line', fontFamily: FONT.nanumPenScript, fontSize: size, lineHeight: 1.3, color: INK,
          minHeight: size * 1.3 * lines.length }}>
          {chars.slice(0, shown).join('')}
          <span style={{ display: 'inline-block', width: 4, height: size * 0.8, background: INK, marginLeft: 6,
            verticalAlign: '-0.08em', opacity: caretOn ? 0.85 : 0 }} />
        </div>
      </div>
    </TitleZone>
  );
};

const Caption: Preset['Caption'] = ({ lines, emphasis }) => {
  const f = useCurrentFrame();
  const size = fitSize(lines, 62, ZONE_W - 70, 48);
  return (
    <CaptionZone style={{ gap: 10 }}>
      {lines.map((line, i) => {
        const p = ci(f, [i * 7, i * 7 + 14], [0, 1]);
        const parts = splitEmphasis(line, emphasis);
        return (
          <div key={i} style={{ ...KO, background: 'rgba(247,238,220,0.93)', padding: '8px 28px 12px', borderRadius: 4,
            transform: `rotate(${i % 2 === 0 ? -0.8 : 0.6}deg) translateY(${(1 - p) * 14}px)`, opacity: p,
            boxShadow: '0 10px 22px rgba(40,20,5,0.3)', fontFamily: FONT.gowunBatang, fontWeight: 700, fontSize: size,
            lineHeight: 1.3, color: INK }}>
            {parts ? (<>{parts.pre}<span style={{ color: '#b4532a' }}>{parts.em}</span>{parts.post}</>) : line}
          </div>
        );
      })}
    </CaptionZone>
  );
};

export const preset: Preset = {
  meta: {
    id: 'typewriter-diary',
    nameKo: '손글씨 일기',
    nameEn: 'Typewriter Diary',
    mood: 'story',
    situations: ['일기', '스토리', '브이로그', '첫 경험'],
    description: '개인적인 경험담을 꺼낼 때, 따뜻한 종이 위에 한 글자씩 써 내려가며 고백하듯 시작합니다.',
    inspiredBy: ['https://github.com/reactvideoeditor/remotion-templates', 'https://github.com/av/remotion-bits'],
  },
  Title,
  Caption,
};
