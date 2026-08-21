/**
 * TimelineCompositionV2Adapter — bridge from RenderProps (legacy timeline model)
 * to the declarative ReelDoc format consumed by ReelDocCanvas.
 *
 * This is a forward-compatibility shim. ENG-05 will wire it to TimelineCompositionV2
 * so the production renderer switches from imperative scene-loop code to the pure
 * interpreter. Until then, this file is a standalone conversion utility.
 *
 * NOTE: TimelineCompositionV2.tsx MUST NOT be modified until ENG-05.
 */
import type { RenderProps, RenderClip } from '@hiob/timeline';
import type { ReelDoc } from '@hiob/timeline/schema';

type ReelElement = ReelDoc['elements'][number];
type VisualElement = Exclude<ReelElement, { type: 'audio' }>;

function visualElement(clip: RenderClip): ReelElement | null {
  if (!clip.url) return null;
  return {
    type: 'video',
    id: clip.id,
    src: clip.url,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    opacity: 1,
    zIndex: clip.zIndex,
    duration: clip.durationMs,
    scale: clip.transforms?.scale ?? 1,
    rotation: clip.transforms?.rotation ?? 0,
    loop: false,
    muted: false,
    startFrom: clip.inMs,
    volume: clip.volume ?? 1,
    fit: 'cover',
    animations: [],
  };
}

function textElement(clip: RenderClip): ReelElement | null {
  if (!clip.textContent) return null;
  return {
    type: 'text',
    id: clip.id,
    text: clip.textContent,
    x: 0,
    y: 75,
    width: 100,
    fontSize: 52,
    fontFamily: 'inherit',
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    opacity: 1,
    zIndex: clip.zIndex + 10,
    blur: false,
    animations: [],
  };
}

function audioElement(clip: RenderClip): ReelElement | null {
  if (!clip.url) return null;
  const categories = { audio: 'voice', music: 'music', sfx: 'sfx' } as const;
  const kind = clip.trackKind as keyof typeof categories;
  return {
    type: 'audio',
    id: clip.id,
    src: clip.url,
    startTime: clip.startMs,
    duration: clip.durationMs,
    volume: clip.volume ?? 1,
    loop: false,
    category: categories[kind],
  };
}

function convertClip(clip: RenderClip): ReelElement | null {
  if (clip.trackKind === 'video') return visualElement(clip);
  if (['caption', 'title', 'overlay'].includes(clip.trackKind)) return textElement(clip);
  if (['audio', 'music', 'sfx'].includes(clip.trackKind)) return audioElement(clip);
  return null;
}

/**
 * Convert legacy RenderProps (from @hiob/timeline) to ReelDoc format.
 *
 * Maps:
 *   video/artifact tracks → VideoElement
 *   text/caption tracks   → TextElement
 *   audio/music/sfx tracks → AudioElement
 *
 * Limitations (fixed in ENG-05):
 * - Video effects/keyframes are not yet mapped (empty animations[])
 * - Text styling uses ReelDoc defaults (no style migration yet)
 * - BrandKit is passed through if present on the clip's attributes
 */
export function renderPropsToReelDoc(renderProps: RenderProps): ReelDoc {
  const { clips, fps, width, height, durationMs, locale } = renderProps;
  const aspect = renderProps.aspect ?? '9:16';

  const visualElements: VisualElement[] = [];
  const audioElements: ReelDoc['elements'] = [];

  for (const clip of clips) {
    const element = convertClip(clip);
    if (!element) continue;
    if (element.type === 'audio') audioElements.push(element);
    else visualElements.push(element);
  }

  const elements: ReelDoc['elements'] = [
    ...visualElements.sort((a, b) => a.zIndex - b.zIndex),
    ...audioElements,
  ];

  return {
    id: crypto.randomUUID(),
    version: '1.0',
    schemaHash: 'adapter-v1',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    title: 'Adapted from RenderProps',
    outputFormat: {
      aspectRatio: aspect,
      width,
      height,
      fps: String(fps),
      durationMs,
    },
    elements,
    metadata: locale ? { locale } : undefined,
  };
}
