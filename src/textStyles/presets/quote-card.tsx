import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Preset } from '../contract';
import { FONT } from '../fonts';
import { CaptionZone, KO, TitleZone, ZONE_W, ci, fitSize, splitEmphasis, splitLines } from '../kits/fitKit';

const BLUE = '#2f6fde';

const Title: Preset['Title'] = ({ text }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines = splitLines(text);
  const size = fitSize(lines, 76, ZONE_W - 40 - 176, 72);
  const s = spring({ frame: f, fps, config: { damping: 15, stiffness: 120 } });
  const mark = spring({ frame: f - 6, fps, config: { damping: 9, stiffness: 140 } });
  const body = ci(f, [8, 22], [0, 1]);
  const who = ci(f, [20, 34], [0, 1]);
  return (
    <TitleZone>
      <div style={{ position: 'relative', width: ZONE_W - 40, transform: `translateY(${(1 - s) * 60}px) rotate(${(1 - s) * -3}deg)`,
        opacity: Math.min(1, s * 1.5) }}>
        <div style={{ background: '#fbfaf7', borderRadius: 34, padding: '36px 46px 26px 130px',
          boxShadow: '0 34px 70px rgba(5,15,35,0.38), inset 0 0 0 1px rgba(0,0,0,0.04)' }}>
          <div style={{ ...KO, whiteSpace: 'pre-line', fontFamily: FONT.gowunBatang, fontWeight: 700, fontSize: size, lineHeight: 1.22,
            color: '#141a26', letterSpacing: '-0.02em', opacity: body, transform: `translateY(${(1 - body) * 12}px)` }}>{text}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 22, paddingTop: 18, borderTop: '2px solid #e8e4dc',
            opacity: who, transform: `translateX(${(1 - who) * -20}px)` }}>
            <div style={{ width: 46, height: 46, borderRadius: 23, background: `linear-gradient(135deg, #8fb8ff, ${BLUE})` }} />
            <div style={{ fontFamily: FONT.notoSansKR, fontWeight: 700, fontSize: 28, color: '#141a26' }}>실구매자 후기</div>
            <div style={{ fontFamily: FONT.notoSansKR, fontWeight: 400, fontSize: 26, color: '#8a8f99' }}>· 리뷰 원문</div>
          </div>
        </div>
        <div style={{ position: 'absolute', left: 30, top: 14, fontFamily: FONT.nanumMyeongjo, fontWeight: 800, fontSize: 190,
          lineHeight: 1, color: BLUE, transform: `scale(${mark})`, transformOrigin: '30% 70%',
          textShadow: '0 8px 18px rgba(20,60,140,0.25)' }}>“</div>
      </div>
    </TitleZone>
  );
};

const Caption: Preset['Caption'] = ({ lines, emphasis }) => {
  const f = useCurrentFrame();
  const size = fitSize(lines, 64, ZONE_W - 40, 48);
  return (
    <CaptionZone>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 22 }}>
        <div style={{ width: 6, borderRadius: 3, background: '#fff', transform: `scaleY(${ci(f, [0, 12], [0, 1])})`,
          transformOrigin: 'top', boxShadow: '0 2px 10px rgba(0,0,0,0.4)' }} />
        <div>
          {lines.map((line, i) => {
            const p = ci(f, [i * 6 + 2, i * 6 + 16], [0, 1]);
            const parts = splitEmphasis(line, emphasis);
            return (
              <div key={i} style={{ ...KO, fontFamily: FONT.gowunBatang, fontWeight: 700, fontSize: size, lineHeight: 1.32, color: '#fff',
                opacity: p, transform: `translateX(${(1 - p) * 18}px)`,
                textShadow: '0 2px 3px rgba(0,0,0,0.7), 0 0 26px rgba(0,0,0,0.6)' }}>
                {parts ? (<>{parts.pre}<span style={{ background: BLUE, borderRadius: 8, padding: '0 10px', textShadow: 'none' }}>{parts.em}</span>{parts.post}</>) : line}
              </div>
            );
          })}
        </div>
      </div>
    </CaptionZone>
  );
};

export const preset: Preset = {
  meta: {
    id: 'quote-card',
    nameKo: '후기 인용 카드',
    nameEn: 'Quote Card',
    mood: 'trust',
    situations: ['후기', '리뷰', '추천', '고객 인터뷰'],
    description: '실제 고객 후기 문장을 인용할 때, 큰 따옴표가 들어간 카드로 말한 사람의 목소리처럼 보여줍니다.',
    inspiredBy: ['https://github.com/reactvideoeditor/remotion-templates'],
  },
  Title,
  Caption,
};
