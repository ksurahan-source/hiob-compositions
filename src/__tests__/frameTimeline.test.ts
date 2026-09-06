import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frameCompositionMetadata, frameRenderPlan } from '../frameTimelineModel.ts';

const sha = 'a'.repeat(64);
function fixture() {
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
