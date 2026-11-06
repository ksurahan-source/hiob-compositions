import React from 'react';
import { Composition, registerRoot, staticFile } from 'remotion';
import type { RenderClip, RenderProps } from '@hiob/timeline';
import { TimelineCompositionV2 } from '../../src/TimelineCompositionV2';
import { TEXT_STYLES } from '../../src/textStyles';

// Render check for the text style pack through the production composition:
// segment 0 has no text_style (built-in look), then one 3s segment per style.
// Render: npx remotion render verification/text-styles/entry.tsx TextStyles out.mp4 --public-dir=<dir with bg.png>

const SEGMENT_MS = 3000;
const SAMPLE = {
  title: '단 3분이면\n김서림 끝',
  cue1: '렌즈에 한 번 뿌리고\n닦아내면 끝이에요',
  cue1Emphasis: '한 번',
  cue2: '하루 종일 선명하게',
};

function segmentClips(index: number, textStyle?: string): RenderClip[] {
  const start = index * SEGMENT_MS;
  const base = { assetKind: undefined, effects: [], keyframes: [], inMs: 0, transforms: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 } };
  const attrs = (extra: Record<string, unknown> = {}) => (textStyle ? { text_style: textStyle, ...extra } : extra);
  return [
    { ...base, id: `bg-${index}`, trackKind: 'video', assetKind: 'image', url: staticFile('bg.png'), zIndex: 0, startMs: start, durationMs: SEGMENT_MS },
    { ...base, id: `title-${index}`, trackKind: 'title', zIndex: 5, startMs: start, durationMs: SEGMENT_MS, textContent: SAMPLE.title, attributes: attrs() },
    { ...base, id: `cap1-${index}`, trackKind: 'caption', zIndex: 6, startMs: start + 300, durationMs: 1300, textContent: SAMPLE.cue1, attributes: attrs({ emphasis: SAMPLE.cue1Emphasis }) },
    { ...base, id: `cap2-${index}`, trackKind: 'caption', zIndex: 6, startMs: start + 1600, durationMs: 1400, textContent: SAMPLE.cue2, attributes: attrs() },
  ] as RenderClip[];
}

const clips = [segmentClips(0), ...TEXT_STYLES.map((style, i) => segmentClips(i + 1, style.meta.id))].flat();
const durationMs = (TEXT_STYLES.length + 1) * SEGMENT_MS;
const defaults: RenderProps & Record<string, unknown> = {
  fps: 30, width: 1080, height: 1920, aspect: '9:16', durationMs, mix: { voice: 1, music: 0, sfx: 0 }, clips,
};

const Video = (props: RenderProps & Record<string, unknown>) => <TimelineCompositionV2 {...props} />;

registerRoot(() => (
  <Composition id="TextStyles" component={Video} width={1080} height={1920} fps={30}
    durationInFrames={Math.ceil((durationMs / 1000) * 30)} defaultProps={defaults} />
));
