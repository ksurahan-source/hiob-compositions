import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {TimelineCompositionV2} from '../../src/TimelineCompositionV2';
import fixtures from './fixtures.json';

const Probe = ({index, solid}: {index: number; solid: boolean}) => {
  const clip = structuredClone(fixtures.clips[index]);
  if (solid) delete (clip.attributes.text_style as {fill?: unknown}).fill;
  return <TimelineCompositionV2 {...{fps: 30, width: 1080, height: 1920, aspect: '9:16',
    durationMs: 46700, clips: [clip], mix: {voice: 1, music: .15, sfx: .6}} as any} />;
};
registerRoot(() => <Composition id="PaintProbe" component={Probe} defaultProps={{index: 0, solid: false}}
  width={1080} height={1920} fps={30} durationInFrames={1401} />);
