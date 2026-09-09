import React from 'react';
import { Composition, registerRoot, staticFile } from 'remotion';
import type { RenderProps } from '@hiob/timeline';
import { TimelineCompositionV2 } from '../../src/TimelineCompositionV2';
const Video = (props: RenderProps & Record<string, unknown>) => <TimelineCompositionV2 {...props} clips={props.clips.map(clip => ({ ...clip,
  url: clip.url?.startsWith('asset:') ? staticFile(clip.url.slice(6)) : clip.url,
}))} />;
const defaults: RenderProps & Record<string, unknown> = { fps:30,width:1080,height:1920,aspect:'9:16',durationMs:15000,mix:{voice:1,music:0.15,sfx:0.6},clips:[] };
registerRoot(() => <Composition id="UGC" component={Video} width={1080} height={1920} fps={30} durationInFrames={450}
  defaultProps={defaults} calculateMetadata={({props})=>({durationInFrames:Math.ceil(props.durationMs/1000*props.fps)})} />);
