import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { frameCompositionMetadata, frameRenderPlan } from '../frameTimelineModel.ts';

const config = vi.hoisted(() => ({ fps: 30, width: 720, height: 1280, durationInFrames: 1440 }));
vi.mock('remotion', async () => {
  const { createElement: el } = await import('react');
  const container = ({ children }: { children?: import('react').ReactNode }) => el('div', null, children);
  return { AbsoluteFill: container,
    Sequence: ({ from, durationInFrames, children }: { from: number, durationInFrames: number, children?: import('react').ReactNode }) => el('section', { 'data-start': from, 'data-frames': durationInFrames }, children),
    Img: ({ src }: { src: string }) => el('img', { src }),
    Audio: ({ src }: { src: string }) => el('audio', { src }),
    OffthreadVideo: ({ src, startFrom, endAt }: { src: string, startFrom: number, endAt: number }) => el('video', { src, 'data-trim-start': startFrom, 'data-trim-end': endAt }),
    useVideoConfig: () => config };
});
vi.mock('@remotion/google-fonts/BlackHanSans', () => ({ loadFont: () => ({ fontFamily: 'Fixture' }) }));
import { FrameTimelineComposition } from '../FrameTimelineComposition';

const sha = 'a'.repeat(64);
export function fixture() {
  return {
    schemaVersion: 'FrameTimeline.v1', scope: { workspaceId: 'w', runId: 'r', revision: 1, approvalDigest: sha },
    fps: { numerator: 30, denominator: 1 }, width: 720, height: 1280, locale: 'en',
    duration: { mode: 'exact', targetFrames: 1440 }, totalFrames: 1440,
    narrativeUnits: [{ id: 'idea', text: 'Narration continues.', sourceTextDigest: sha, evidenceIds: ['source'] }],
    assets: [
      { id: 'v', kind: 'video', url: 'https://assets.example/video.mp4', sha256: sha, durationFrames: 1440 },
      { id: 'a', kind: 'audio', url: 'https://assets.example/voice.wav', sha256: sha, sampleRate: 48000, sampleCount: 2304000, sourceTextDigest: sha },
    ],
    pictures: [
      { id: 'p1', assetId: 'v', narrativeId: 'idea', startFrame: 0, endFrame: 24, sourceStartFrame: 0 },
      { id: 'p2', assetId: 'v', narrativeId: 'idea', startFrame: 24, endFrame: 1440, sourceStartFrame: 24 },
    ],
    narration: [{ id: 'a1', assetId: 'a', narrativeIds: ['idea'], sourceTextDigest: sha, alignmentDigest: sha, startFrame: 0, endFrame: 1440 }],
    captions: [{ id: 'c', narrationId: 'a1', text: 'Narration continues.', startSample: 0, endSample: 326400 }],
  };
}
test('metadata is canonical frames, with independent render lane counts', () => {
  const input = fixture();
  assert.deepEqual(frameCompositionMetadata(input), { fps: 30, width: 720, height: 1280, durationInFrames: 1440 });
  const plan = frameRenderPlan(input);
  assert.equal(plan.pictures.length, 2);
  assert.equal(plan.narration.length, 1);
  assert.equal(plan.captions.length, 1);
  assert.equal(plan.pictures[1].sourceStartFrame, 24);
  assert.equal(plan.captions[0].endFrame, 204);
  assert.equal(plan.narration[0].endFrame, 1440);
});
test('renderer never repairs a broken approved timeline', () => {
  const input = fixture(); input.pictures[1].startFrame = 25;
  assert.throws(() => frameRenderPlan(input), /PICTURE_COVERAGE/);
  assert.throws(() => frameCompositionMetadata(input), /PICTURE_COVERAGE/);
});

test.each(['ko', 'en'])('renders independent media and caption sequences for %s', locale => {
  const input = fixture(); input.locale = locale;
  input.assets.push({ id: 'i', kind: 'image', url: 'https://assets.example/product.png', sha256: sha } as typeof input.assets[number]);
  input.pictures[0].assetId = 'i';
  const html = renderToStaticMarkup(createElement(FrameTimelineComposition, { timeline: input }));
  assert.match(html, /data-start="24" data-frames="1416"/);
  assert.match(html, /data-trim-start="24" data-trim-end="1440"/);
  assert.match(html, /<audio src="https:\/\/assets.example\/voice.wav"/);
  assert.match(html, /Narration continues\./);
  assert.match(html, /word-break:(keep-all|normal)/);
});

test.each(['fps', 'width', 'height', 'durationInFrames'] as const)('rejects mismatched composition %s', key => {
  const original = config[key];
  try {
    config[key] += 1;
    assert.throws(() => renderToStaticMarkup(createElement(FrameTimelineComposition, { timeline: fixture() })), /RENDER_CONFIG_MISMATCH/);
  } finally { config[key] = original; }
});
