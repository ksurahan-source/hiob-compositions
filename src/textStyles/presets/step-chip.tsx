import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT } from '../fonts';
import type { CaptionProps, Preset, TitleProps } from '../contract';
import { KO, LINE_STAGGER, Zone, ease, splitEmphasis, splitTitle } from '../kits/lineKit';

const BLUE = '#1f5cff';
const NAVY = '#0c1a33';

/** A short label line such as "1단계" / "STEP 2" becomes a chip instead of body text. */
const isStepLabel = (line: string, emphasis?: string): boolean =>
  line.trim() === emphasis?.trim() || /^(step\s*\d+|\d+\s*단계|\d+\.)$/i.test(line.trim());

const firstNumber = (text: string): string | null => text.match(/\d+/)?.[0] ?? null;

const Title: React.FC<TitleProps> = ({ text }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines = splitTitle(text);
  const num = firstNumber(text);
  const chip = spring({ frame: f, fps, config: { damping: 12, stiffness: 200, mass: 0.6 } });
  const panel = ease(f, 4, 18);
  return (
    <Zone kind="title" align="flex-start">
      <div style={{ display: 'flex', alignItems: 'stretch', filter: 'drop-shadow(0 18px 34px rgba(12,26,51,0.35))' }}>
        <div
          style={{
            width: 170,
            borderRadius: '28px 0 0 28px',
            background: BLUE,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            transform: `scale(${chip})`,
            transformOrigin: 'right center',
          }}
        >
          <div style={{ fontFamily: FONT.ibmPlexSansKR, fontWeight: 700, fontSize: 26, letterSpacing: '0.2em', opacity: 0.8 }}>STEP</div>
          <div style={{ fontFamily: FONT.ibmPlexSansKR, fontWeight: 700, fontSize: 110, lineHeight: 1 }}>{num ?? '✓'}</div>
        </div>
        <div
          style={{
            background: '#fff',
            borderRadius: '0 28px 28px 0',
            padding: '30px 44px 34px 38px',
            clipPath: `inset(0 ${(1 - panel) * 100}% 0 0)`,
          }}
        >
          {lines.map((line, i) => {
            const p = ease(f, 8 + i * 5, 22 + i * 5);
            return (
              <div
                key={i}
                style={{
                  ...KO,
                  fontFamily: FONT.ibmPlexSansKR,
                  fontWeight: 700,
                  fontSize: 76,
                  lineHeight: 1.22,
                  letterSpacing: '-0.03em',
                  color: i === lines.length - 1 ? BLUE : NAVY,
                  opacity: p,
                  transform: `translateX(${(1 - p) * -60}px)`,
                }}
              >
                {line}
              </div>
            );
          })}
        </div>
      </div>
    </Zone>
  );
};

const Caption: React.FC<CaptionProps> = ({ lines, emphasis }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Zone kind="caption" align="flex-start" gap={16}>
      {lines.map((line, i) => {
        const start = i * LINE_STAGGER;
        if (isStepLabel(line, emphasis)) {
          const pop = spring({ frame: f - start, fps, config: { damping: 11, stiffness: 240, mass: 0.5 } });
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                background: BLUE,
                color: '#fff',
                borderRadius: 999,
                padding: '8px 30px 10px 12px',
                fontFamily: FONT.ibmPlexSansKR,
                fontWeight: 700,
                fontSize: 52,
                boxShadow: '0 10px 24px rgba(31,92,255,0.4)',
                transform: `scale(${pop})`,
                transformOrigin: 'left center',
              }}
            >
              <div style={{ width: 52, height: 52, borderRadius: 26, background: '#fff', color: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34 }}>
                {firstNumber(line) ?? '•'}
              </div>
              {line}
            </div>
          );
        }
        const p = ease(f, start, start + 14);
        return (
          <div
            key={i}
            style={{
              ...KO,
              fontFamily: FONT.ibmPlexSansKR,
              fontWeight: 700,
              fontSize: 60,
              lineHeight: 1.3,
              color: NAVY,
              background: '#fff',
              borderLeft: `8px solid ${BLUE}`,
              borderRadius: '6px 18px 18px 6px',
              padding: '14px 30px 16px 26px',
              boxShadow: '0 12px 30px rgba(12,26,51,0.25)',
              opacity: p,
              transform: `translateX(${(1 - p) * -80}px)`,
            }}
          >
            {splitEmphasis(line, emphasis).map((s, j) => (
              <span key={j} style={s.em ? { color: BLUE } : undefined}>
                {s.text}
              </span>
            ))}
          </div>
        );
      })}
    </Zone>
  );
};

export const preset: Preset = {
  meta: {
    id: 'step-chip',
    nameKo: '단계 칩',
    nameEn: 'Step Chip',
    mood: 'info',
    situations: ['사용법', '튜토리얼', '단계별 안내', '비교'],
    description: '사용 방법이나 순서를 1단계·2단계처럼 번호를 붙여 차근차근 안내할 때 씁니다.',
    inspiredBy: ['https://github.com/av/remotion-bits', 'https://github.com/vshukla7/remotion-captions-themes'],
  },
  Title,
  Caption,
};
