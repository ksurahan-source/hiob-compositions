import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT } from '../fonts';
import type { CaptionProps, Preset, TitleProps } from '../contract';
import { KO, LINE_STAGGER, Zone, countUpText, ease, hasDigit, splitEmphasis, splitTitle } from '../kits/lineKit';

const MINT = '#7ff0c8';
const COUNT_FRAMES = 26;
const SHADOW = '0 4px 18px rgba(0,0,0,0.55), 0 2px 3px rgba(0,0,0,0.6)';

/** Round seal: dashed ring turns slowly, check mark draws in, whole seal stamps down. */
const Seal: React.FC<{ f: number; fps: number }> = ({ f, fps }) => {
  const stamp = spring({ frame: f - 14, fps, config: { damping: 11, stiffness: 160, mass: 0.7 } });
  const draw = ease(f, 20, 34);
  const scale = 1.8 - 0.8 * stamp;
  const CHECK_LEN = 90;
  return (
    <svg
      width={150}
      height={150}
      viewBox="0 0 150 150"
      style={{
        opacity: Math.min(1, stamp * 1.5),
        transform: `scale(${scale}) rotate(${(1 - stamp) * -24 - 8}deg)`,
        filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.45))',
        flexShrink: 0,
      }}
    >
      <circle cx={75} cy={75} r={66} fill="rgba(8,30,28,0.82)" stroke={MINT} strokeWidth={3} />
      <circle
        cx={75}
        cy={75}
        r={56}
        fill="none"
        stroke={MINT}
        strokeWidth={2}
        strokeDasharray="4 7"
        transform={`rotate(${f * 1.2} 75 75)`}
      />
      <path
        d="M47 77 L67 96 L104 56"
        fill="none"
        stroke={MINT}
        strokeWidth={10}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={CHECK_LEN}
        strokeDashoffset={CHECK_LEN * (1 - draw)}
      />
    </svg>
  );
};

const Title: React.FC<TitleProps> = ({ text }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines = splitTitle(text);
  const count = ease(f, 4, 4 + COUNT_FRAMES * 1.4);
  return (
    <Zone kind="title" align="flex-start">
      <div style={{ display: 'flex', alignItems: 'center', gap: 34 }}>
        <Seal f={f} fps={fps} />
        <div>
          {lines.map((line, i) => {
            const p = ease(f, i * 5, 14 + i * 5);
            const numeric = hasDigit(line);
            return (
              <div
                key={i}
                style={{
                  ...KO,
                  fontFamily: FONT.notoSansKR,
                  fontWeight: 900,
                  fontSize: numeric ? 92 : 78,
                  lineHeight: 1.18,
                  letterSpacing: '-0.03em',
                  color: numeric ? MINT : '#fff',
                  fontVariantNumeric: 'tabular-nums',
                  textShadow: SHADOW,
                  opacity: p,
                  transform: `translateX(${(1 - p) * -28}px)`,
                }}
              >
                {numeric ? countUpText(line, count) : line}
              </div>
            );
          })}
        </div>
      </div>
      {/* hairline rule under the stat block */}
      <div
        style={{
          marginTop: 22,
          width: 640,
          height: 2,
          background: `linear-gradient(90deg, ${MINT}, rgba(127,240,200,0))`,
          transform: `scaleX(${ease(f, 18, 40)})`,
          transformOrigin: 'left',
        }}
      />
    </Zone>
  );
};

const Caption: React.FC<CaptionProps> = ({ lines, emphasis }) => {
  const f = useCurrentFrame();
  return (
    <Zone kind="caption" align="center">
      {lines.map((line, i) => {
        const start = i * LINE_STAGGER;
        const p = ease(f, start, start + 10);
        const count = ease(f, start + 2, start + 2 + COUNT_FRAMES);
        return (
          <div
            key={i}
            style={{
              ...KO,
              textAlign: 'center',
              fontFamily: FONT.notoSansKR,
              fontWeight: 700,
              fontSize: 68,
              lineHeight: 1.36,
              color: '#fff',
              textShadow: SHADOW,
              fontVariantNumeric: 'tabular-nums',
              opacity: p,
              transform: `translateY(${(1 - p) * 14}px)`,
            }}
          >
            {splitEmphasis(line, emphasis).map((s, j) =>
              s.em ? (
                <span key={j} style={{ color: MINT, fontWeight: 900 }}>
                  {hasDigit(s.text) ? countUpText(s.text, count) : s.text}
                </span>
              ) : (
                <span key={j}>{s.text}</span>
              ),
            )}
          </div>
        );
      })}
    </Zone>
  );
};

export const preset: Preset = {
  meta: {
    id: 'stat-stamp',
    nameKo: '숫자 인증 도장',
    nameEn: 'Stat Stamp',
    mood: 'trust',
    situations: ['수치', '인증', '판매량', '후기 수'],
    description: '판매량·만족도·테스트 통과처럼 숫자와 검증 결과를 강조할 때 씁니다.',
    inspiredBy: ['https://github.com/reactvideoeditor/remotion-templates'],
  },
  Title,
  Caption,
};
