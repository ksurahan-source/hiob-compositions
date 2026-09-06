import { compileFrameTimeline } from '@hiob/timeline/frame-timeline';

/** Shared by preview, local rendering and render metadata. No timing repair. */
export function frameRenderPlan(input: unknown) {
  const timeline = compileFrameTimeline(input);
  const assets = new Map(timeline.assets.map(asset => [asset.id, asset]));
  return {
    ...timeline,
    pictures: timeline.pictures.map(cut => ({ ...cut, asset: assets.get(cut.assetId)! })),
    narration: timeline.narration.map(voice => ({ ...voice, asset: assets.get(voice.assetId)! })),
  };
}

export function frameCompositionMetadata(input: unknown) {
  const timeline = compileFrameTimeline(input);
  return {
    fps: timeline.fps.numerator / timeline.fps.denominator,
    width: timeline.width,
    height: timeline.height,
    durationInFrames: timeline.totalFrames,
  };
}
