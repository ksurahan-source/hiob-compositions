import { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/BlackHanSans';
import { frameRenderPlan } from './frameTimelineModel';

const { fontFamily } = loadFont();

/** Explicit frame lanes. The legacy TimelineCompositionV2 is unchanged.
 * Input is the original versioned contract, never a trusted precompiled object.
 * No implicit cuts, fades, caption extensions, crops, speed changes or deduping.
 */
export function FrameTimelineComposition({ timeline }: { timeline: unknown }) {
  const plan = useMemo(() => frameRenderPlan(timeline), [timeline]);
  const config = useVideoConfig();
  if (config.fps !== plan.fps.numerator / plan.fps.denominator
    || config.durationInFrames !== plan.totalFrames
    || config.width !== plan.width || config.height !== plan.height) {
    throw new Error('FRAME_TIMELINE_RENDER_CONFIG_MISMATCH');
  }
  return (
    <AbsoluteFill style={{ backgroundColor: '#101216' }}>
      {plan.pictures.map(cut => (
        <Sequence key={cut.id} from={cut.startFrame} durationInFrames={cut.endFrame - cut.startFrame}>
          {cut.asset.kind === 'video'
            ? <OffthreadVideo src={cut.asset.url} muted startFrom={cut.sourceStartFrame}
                endAt={cut.sourceStartFrame + cut.endFrame - cut.startFrame}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : <Img src={cut.asset.url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
        </Sequence>
      ))}
      {plan.narration.map(voice => (
        <Sequence key={voice.id} from={voice.startFrame} durationInFrames={voice.endFrame - voice.startFrame}>
          <Audio src={voice.asset.url} volume={1} />
        </Sequence>
      ))}
      {plan.captions.map(cue => (
        <Sequence key={cue.id} from={cue.startFrame} durationInFrames={cue.endFrame - cue.startFrame}>
          <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: plan.height * 0.36 }}>
            <div style={{
              width: '78%', marginRight: '5%', padding: '0.3em 0.5em', boxSizing: 'border-box',
              color: 'white', background: 'rgba(0, 0, 0, 0.8)', borderRadius: 10,
              fontFamily, fontSize: plan.width * 0.046, lineHeight: 1.35,
              textAlign: 'center', whiteSpace: 'pre-wrap', wordBreak: plan.locale === 'ko' ? 'keep-all' : 'normal',
            }}>{cue.text}</div>
          </AbsoluteFill>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
