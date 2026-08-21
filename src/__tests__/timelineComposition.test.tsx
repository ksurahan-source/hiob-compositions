import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import type { Effect, RenderClip, RenderProps } from '@hiob/timeline';

const remotionState = vi.hoisted(() => ({ frame: 0, fps: 30 }));

vi.mock('remotion', async () => {
  const ReactModule = await import('react');
  const container = ({ children }: { children?: React.ReactNode }) => ReactModule.createElement('div', null, children);
  const media = ({ children }: { children?: React.ReactNode }) => ReactModule.createElement('span', null, children);
  const interpolate = (
    input: number,
    inputRange: number[],
    outputRange: number[],
    options: { extrapolateLeft?: string; extrapolateRight?: string; easing?: (value: number) => number } = {},
  ): number => {
    if (input <= inputRange[0] && options.extrapolateLeft === 'clamp') return outputRange[0];
    const last = inputRange.length - 1;
    if (input >= inputRange[last] && options.extrapolateRight === 'clamp') return outputRange[last];
    let index = 0;
    while (index < last - 1 && input > inputRange[index + 1]) index += 1;
    const width = inputRange[index + 1] - inputRange[index];
    const raw = width === 0 ? 0 : (input - inputRange[index]) / width;
    const progress = options.easing ? options.easing(raw) : raw;
    return outputRange[index] + (outputRange[index + 1] - outputRange[index]) * progress;
  };
  return {
    AbsoluteFill: container,
    Audio: media,
    Img: media,
    Loop: container,
    OffthreadVideo: media,
    Sequence: container,
    interpolate,
    useCurrentFrame: () => remotionState.frame,
    useVideoConfig: () => ({ fps: remotionState.fps, width: 1080, height: 1920, durationInFrames: 300 }),
  };
});

vi.mock('@remotion/gif', () => ({ Gif: ({ children }: { children?: React.ReactNode }) => <span>{children}</span> }));
vi.mock('@remotion/google-fonts/BlackHanSans', () => ({ loadFont: () => ({ fontFamily: 'Mock Black Han Sans' }) }));

import { TimelineCompositionV2, __testing } from '../TimelineCompositionV2';
import * as publicApi from '../index';
import { chromaticSplitFilter } from '../effects/chromaticSplit';
import { FilmGrain, computeFilmGrainOpacity } from '../effects/filmGrain';
import { LightLeak } from '../effects/lightLeak';
import { LightSweep } from '../effects/lightSweep';
import { PunchInContainer, punchInStyle, punchInTransform } from '../effects/punchIn';
import { SlidePanEntrance, pickDirection, slidePanEntrance } from '../effects/slidePan';
import { speedRampStyle } from '../effects/speedRamp';
import { ReelDocCanvas, LocaleConfigContext, __testing as reelDocTesting } from '../lib/ReelDocCanvas';
import { AnimationRegistry, defaultAnimationRegistry } from '../lib/animationRegistry';
import { EASING_FN, cubicBezier, getEasing } from '../lib/easing';
import {
  ElementRendererRegistry,
  applyAnimations,
  defaultElementRendererRegistry,
  evaluateKfProperty,
} from '../lib/elementRenderers';
import AudioElementRenderer from '../lib/elementRenderers/AudioElementRenderer';
import ShapeElementRenderer from '../lib/elementRenderers/ShapeElementRenderer';
import TextElementRenderer from '../lib/elementRenderers/TextElementRenderer';
import VideoElementRenderer from '../lib/elementRenderers/VideoElementRenderer';
import { renderPropsToReelDoc } from '../lib/TimelineCompositionV2Adapter';
import { DEFAULT_LOCALE_CONFIG, resolveLocaleConfig } from '../localeConfig';

function makeClip(overrides: Partial<RenderClip> = {}): RenderClip {
  return {
    id: 'clip-1',
    trackKind: 'video',
    assetKind: 'image',
    zIndex: 1,
    startMs: 0,
    durationMs: 1200,
    inMs: 0,
    transforms: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    effects: [],
    keyframes: [],
    ...overrides,
  };
}

function makeEffect(kind: Effect['kind'], params: Effect['params'] = {}): Effect {
  return { kind, params };
}

function renderNode(node: React.ReactNode): string {
  return renderToStaticMarkup(<>{node}</>);
}

function makeRuntime(overrides: Record<string, unknown> = {}) {
  return {
    fps: 30,
    frame: 0,
    localeConfig: DEFAULT_LOCALE_CONFIG,
    sceneType: 'narrator',
    sceneLayer: 'narrator',
    opacity: 1,
    scale: 1,
    x: 0,
    y: 0,
    rotation: 0,
    durationInFrames: 30,
    speed: 1,
    transformStyle: { opacity: 1 },
    effects: { opacity: 1, filter: '', transform: '', clipPath: '', blendMode: '' },
    isAudioAsset: false,
    isVisualAsset: true,
    ...overrides,
  };
}

describe('TimelineCompositionV2 deterministic helpers', () => {
  test('covers frame math, scene classification, styles, and masks', () => {
    expect(__testing.msToStartFrame(-1, 30)).toBe(0);
    expect(__testing.msToStartFrame(1000, 30)).toBe(30);
    expect(__testing.msToDurationFrames(0, 30)).toBe(1);
    expect(__testing.msToDurationFrames(1000, 30)).toBe(30);
    expect(__testing.clipHash()).toBe(0);
    expect(__testing.clipHash('abc')).toBeGreaterThan(0);

    for (let index = 0; index < 100; index += 1) {
      expect(__testing.kenBurnsTransform(15, 30, `clip-${index}`).scale).toBeGreaterThan(0);
      expect(__testing.subshotKenBurns(15, 30, `sub-${index}`).scale).toBeGreaterThan(0);
    }

    const explicit = makeClip({
      attributes: { scene_type: ' CTA ', scene_layer: 'background' } as unknown as RenderClip['attributes'],
    });
    expect(__testing.normalizeSceneType(' PROOF ')).toBe('proof');
    expect(__testing.normalizeSceneType(7)).toBeNull();
    expect(__testing.normalizeSceneType('unknown')).toBeNull();
    expect(__testing.resolveSceneType(explicit)).toBe('cta');
    expect(__testing.resolveSceneLayer(explicit, 'cta')).toBe('background');

    const sceneCases: Array<[Partial<RenderClip>, string]> = [
      [{ effects: [makeEffect('proof-frame')] }, 'proof'],
      [{ attributes: { scene_role: '사회적 증거' } }, 'proof'],
      [{ attributes: { logic_function: 'product demo' } }, 'product'],
      [{ attributes: { scene_role: 'call-to-action' } }, 'cta'],
      [{ beatIndex: 0 }, 'hook'],
      [{ beatIndex: 2 }, 'narrator'],
    ];
    for (const [overrides, expected] of sceneCases) {
      expect(__testing.resolveSceneType(makeClip(overrides))).toBe(expected);
    }

    const layerCases: Array<[Partial<RenderClip>, Parameters<typeof __testing.resolveSceneLayer>[1], string]> = [
      [{ assetKind: 'audio' }, 'narrator', 'audio'],
      [{ assetKind: undefined, trackKind: 'music' }, 'narrator', 'audio'],
      [{ assetKind: 'image', effects: [makeEffect('proof-frame')] }, 'proof', 'hero'],
      [{ assetKind: 'video' }, 'hook', 'hero'],
      [{ assetKind: 'image' }, 'product', 'narrator'],
      [{ assetKind: undefined, trackKind: 'caption' }, 'narrator', 'caption'],
      [{ assetKind: undefined, effects: [makeEffect('proof-frame')] }, 'proof', 'hero'],
      [{ assetKind: undefined }, 'hook', 'hero'],
      [{ assetKind: undefined }, 'narrator', 'narrator'],
    ];
    for (const [overrides, scene, expected] of layerCases) {
      expect(__testing.resolveSceneLayer(makeClip(overrides), scene)).toBe(expected);
    }

    expect(__testing.paramNumber('3', 1)).toBe(3);
    expect(__testing.paramNumber('no', 1)).toBe(1);
    expect(__testing.paramString(' yes ', 'no')).toBe(' yes ');
    expect(__testing.paramString('', 'no')).toBe('no');
    const style: React.CSSProperties = {};
    __testing.appendFilter(style, 'blur(1px)');
    __testing.appendFilter(style, 'contrast(2)');
    expect(style.filter).toContain('contrast');

    for (const preset of ['warm', 'cool', 'film', 'bw', 'noir', 'vivid', 'fade', 'vintage', 'dreamy', 'other']) {
      expect(__testing.lookFilter(preset)).toBeTruthy();
    }
    for (const shape of ['circle', 'ellipse', 'rect', 'rounded', 'unknown']) {
      expect(typeof __testing.maskClipPath(shape, 200, -10, 130)).toBe('string');
    }
    expect(renderNode(<__testing.ChromaKeyDefs id="key" similarity={-1} />)).toContain('filter');
    expect(renderNode(<__testing.ChromaKeyDefs id="key" similarity={2} />)).toContain('filter');
  });

  test('covers transform effects, overlays, audio, and keyframes', () => {
    const effects: Effect[] = [
      makeEffect('fade-in', { durationMs: 300 }),
      makeEffect('fade-out', { durationMs: 300 }),
      makeEffect('blur', { radiusPx: 4 }),
      makeEffect('glow', { intensity: 0.5, color: '#fff' }),
      makeEffect('shake', { amplitudePx: 3, speed: 2 }),
      makeEffect('ken-burns', { from: 1, to: 1.2 }),
      makeEffect('zoom-in', { amount: 0.2 }),
      makeEffect('zoom-out', { amount: 0.2 }),
      makeEffect('filter', { preset: 'warm' }),
      makeEffect('adjust', { brightness: 4, contrast: -1, saturation: 2, temperature: 20 }),
      makeEffect('chromatic-split', { intensity: 3, alpha: 0.5, pulse: true, axis: 'y' }),
      makeEffect('speed-ramp', { at: 0.5, frames: 5, intensity: 5, blur: 8, zoom: 1.1, direction: 'right' }),
      makeEffect('opacity', { value: 0.5 }),
      makeEffect('blend', { mode: 'screen' }),
      makeEffect('mask', { shape: 'circle', size: 60, x: 50, y: 50 }),
    ];
    const clip = makeClip({ effects });
    expect(__testing.transformEffects(clip, 5, 30, 36).opacity).toBeGreaterThanOrEqual(0);
    expect(__testing.transformEffects(clip, 35, 30, 36).filter).toBeTruthy();
    expect(__testing.transformEffects(makeClip({ effects: [{ ...makeEffect('blur'), disabled: true } as Effect] }), 0, 30, 30).filter).toBe('');

    const transitions = ['fade', 'crossfade', 'wipe', 'slide-l', 'slide-r', 'slide-u', 'slide-d', 'zoom', 'unknown'];
    for (const type of transitions) {
      const transition = makeEffect('transition', { type, durationMs: 300, dir: 'in' });
      expect(__testing.transformEffects(makeClip({ effects: [transition] }), 3, 30, 30)).toBeTruthy();
    }
    expect(__testing.transformEffects(makeClip({ effects: [makeEffect('transition', { durationMs: 0 })] }), 3, 30, 30)).toBeTruthy();
    expect(__testing.transformEffects(makeClip({ effects: [makeEffect('transition', { durationMs: 300, dir: 'out' })] }), 3, 30, 30)).toBeTruthy();
    expect(__testing.transformEffects(makeClip({ effects: [makeEffect('transition', { durationMs: 300, dir: 'out' })] }), 29, 30, 30)).toBeTruthy();
    expect(__testing.transformEffects(makeClip({ effects: [makeEffect('adjust', { temperature: -50 })] }), 3, 30, 30).filter).toContain('hue-rotate');
    expect(__testing.transformEffects(makeClip({ effects: [makeEffect('glow', { radiusPx: 100 })] }), 3, 30, 30).filter).toContain('64px');
    expect(__testing.transformEffects(makeClip({ effects: [makeEffect('mask', { shape: 'none' })] }), 3, 30, 30).clipPath).toBe('');

    const overlays = makeClip({
      effects: [
        makeEffect('grain'),
        makeEffect('vignette'),
        makeEffect('glitch', { intensity: 2 }),
        makeEffect('light-leak', { intensity: -1 }),
        makeEffect('vhs-scanline', { intensity: 2 }),
        makeEffect('particle', { count: 2, color: '#fff' }),
        makeEffect('light-sweep', { loop: 'true' }),
      ],
    });
    expect(renderNode(__testing.effectOverlays(overlays, 0, 30))).toContain('span');
    expect(renderNode(__testing.effectOverlays(overlays, 13, 30))).toContain('div');
    expect(__testing.effectOverlays(makeClip(), 0, 30)).toBeNull();

    const mix = { voice: 0.8, music: 0.2, sfx: 0.4, autoDuck: false, duck: 0.7 } as RenderProps['mix'];
    expect(__testing.resolveAudioVolume(makeClip({ volume: 0 }), mix)).toBe(0);
    expect(__testing.resolveAudioVolume(makeClip({ trackKind: 'audio', assetKind: 'audio' }), mix)).toBe(0.8);
    expect(__testing.resolveAudioVolume(makeClip({ trackKind: 'music', assetKind: 'audio' }), mix)).toBe(0.2);
    expect(__testing.resolveAudioVolume(makeClip({ trackKind: 'sfx', assetKind: 'audio' }), mix)).toBe(0.4);
    expect(__testing.resolveAudioVolume(makeClip({ trackKind: 'video' }), mix)).toBe(1);

    const keyframes = [
      { property: 'scale' as const, timeMs: 0, value: 1, easing: 'ease-in' as const },
      { property: 'scale' as const, timeMs: 500, value: 2, easing: 'linear' as const },
    ];
    const keyed = makeClip({ keyframes });
    expect(__testing.applyKf(makeClip(), 'scale', 3, 0, 30)).toBe(3);
    expect(__testing.applyKf(keyed, 'scale', 3, -1, 30)).toBe(1);
    expect(__testing.applyKf(keyed, 'scale', 3, 8, 30)).toBeGreaterThan(1);
    expect(__testing.applyKf(keyed, 'scale', 3, 60, 30)).toBe(2);
  });

  test('covers caption parsing and animation choices', () => {
    expect(__testing.chunkLongCaption('singleword', 3, 4, 'latin')).toEqual(['singleword']);
    expect(__testing.chunkLongCaption('가나다라마바사', 3, 2, 'cjk').length).toBeGreaterThan(1);
    expect(__testing.chunkLongCaption('one two three four five', 3, 5, 'latin').length).toBeGreaterThan(1);
    expect(__testing.mergeCaptionLines([' a ', '', 'b', 'c'], 2)).toEqual(['a', 'b c']);
    expect(__testing.mergeCaptionLines(['a'], 2)).toEqual(['a']);
    expect(__testing.captionLineGroups(undefined)).toEqual([]);
    expect(__testing.captionLineGroups('a\nb\nc', 2)).toEqual(['a', 'b c']);
    expect(__testing.captionLineGroups('a. b?', 3)).toEqual(['a.', 'b?']);
    expect(__testing.captionLineGroups('short')).toEqual(['short']);
    expect(__testing.captionLineGroups('a very long english caption that wraps cleanly', 3, 12, 'latin').length).toBeGreaterThan(1);
    expect(__testing.captionKeywordIndex(['hello', '매출'], false)).toBe(1);
    expect(__testing.captionKeywordIndex(['a', 'longest'], true)).toBe(1);
    expect(__testing.captionKeywordIndex([], true)).toBe(-1);
    expect(__testing.captionKeywordIndex(['plain'], false)).toBe(-1);

    for (const effect of ['pop', 'slide-in', 'bounce', 'rise', 'fade-in', 'unknown']) {
      expect(__testing.applyTypeEntranceAnimation(effect, 0.5)).toHaveProperty('opacity');
    }
    expect(__testing.applyTypeEntranceAnimation('pop', 2)).toEqual({ opacity: 1, transform: '' });
    expect(__testing.applyTypeEntranceAnimation('pop', 0.1).opacity).toBe(0);

    expect(__testing.isAsciiDigit('0')).toBe(true);
    expect(__testing.isAsciiDigit('x')).toBe(false);
    expect(__testing.isAsciiDigit(undefined)).toBe(false);
    for (const text of ['10%', '3 배', '20,000 원', '12개월', '7시간']) {
      expect(__testing.containsMetric(text)).toBe(true);
    }
    expect(__testing.containsMetric('abc 1 xyz')).toBe(false);

    const templateCases: Array<[Parameters<typeof __testing.autoCaptionTemplate>[0], string, string]> = [
      ['narrator', '충격', 'shock'],
      ['narrator', '지금 10%', 'cta'],
      ['narrator', '검증 10%', 'proof'],
      ['narrator', '10%', 'metric'],
      ['narrator', '왜?', 'question'],
      ['narrator', '맑은 물', 'fresh'],
      ['narrator', '진짜 최고', 'hype'],
      ['narrator', '첫 설렘', 'heartbeat'],
      ['product', 'plain', 'product'],
      ['hook', 'plain', 'question'],
      ['narrator', 'plain', 'plain'],
    ];
    for (const [scene, text, expected] of templateCases) {
      expect(__testing.autoCaptionTemplate(scene, text)).toBe(expected);
    }
    expect(__testing.resolveCaptionTemplate(makeClip({ attributes: { caption_template: 'reveal' } }), 'narrator', 'x').deco).toBe('spark');
    expect(__testing.resolveCaptionTemplate(makeClip({ attributes: { caption_template: 'missing' } }), 'narrator', 'x').palette).toBe('default');
    for (const motion of ['spin', 'count', 'wave', 'pulse', 'glitch', 'none'] as const) {
      expect(typeof __testing.kwMotionTransform(motion, 31, 1)).toBe('string');
    }
    expect(__testing.kwMotionTransform('glitch', 10, 0)).toBe('');
  });
});

describe('TimelineCompositionV2 exhaustive contracts', () => {
  test('covers fallback effect, audio, keyframe, and caption branches', () => {
    const noCollections = makeClip({ effects: undefined, keyframes: undefined, attributes: undefined });
    expect(__testing.effectByKind(noCollections, 'blur')).toBeUndefined();
    expect(__testing.effectByKinds(noCollections, ['blur'])).toBeUndefined();
    expect(__testing.clipAttributes(noCollections)).toEqual({});
    expect(__testing.transformEffects(noCollections, 0, 30, 30)).toMatchObject({ opacity: 1, filter: '' });
    expect(__testing.applyKf(noCollections, 'x', 7, 0, 30)).toBe(7);

    expect(__testing.transformEffects(makeClip({ effects: [makeEffect('fade-in', { durationMs: 0 })] }), 1, 30, 30).opacity).toBe(1);
    expect(__testing.transformEffects(makeClip({ effects: [makeEffect('fade-out', { durationMs: 0 })] }), 1, 30, 30).opacity).toBe(1);
    expect(__testing.transformEffects(makeClip({ effects: [makeEffect('chromatic-split', { pulse: 'true' })] }), 1, 30, 30).filter).toBeTruthy();
    expect(__testing.transformEffects(makeClip({ effects: [makeEffect('speed-ramp', { at: 0.5, frames: 10, blur: 20 })] }), 20, 30, 30).filter).toBeTruthy();

    expect(__testing.resolveAudioVolume(makeClip({ trackKind: 'audio', assetKind: 'audio' }))).toBe(1);
    expect(__testing.resolveAudioVolume(makeClip({ trackKind: 'music', assetKind: 'audio' }))).toBe(0.15);
    expect(__testing.resolveAudioVolume(makeClip({ trackKind: 'sfx', assetKind: 'audio' }))).toBe(0.6);

    const unknownEasing = makeClip({ keyframes: [
      { property: 'x', timeMs: 0, value: 0, easing: 'missing' as never },
      { property: 'x', timeMs: 1000, value: 10, easing: 'linear' },
    ] });
    expect(__testing.applyKf(unknownEasing, 'x', 0, 15, 30)).toBe(5);
    expect(__testing.captionKeywordIndex(['longest', 'a'], true)).toBe(0);
    expect(__testing.applyTypeEntranceAnimation('bounce', 0.8).opacity).toBe(1);
    expect(__testing.autoCaptionTemplate('narrator', '')).toBe('plain');
    expect(__testing.resolveCaptionTemplate(noCollections, 'narrator', '').palette).toBe('default');

    remotionState.frame = 0;
    expect(renderNode(<__testing.CaptionDecoLayer deco="doubt" color="#fff" />)).toContain('?');
    expect(__testing.captionBaseStyle('hook')).toBeTruthy();
    expect(__testing.captionBaseStyle('proof')).toBeTruthy();
    expect(__testing.captionBaseStyle('narrator')).toBeTruthy();
    const spark = __testing.resolveCaptionTemplate(makeClip({ attributes: { caption_template: 'fresh' } }), 'narrator', 'x');
    const impact = __testing.resolveCaptionTemplate(makeClip({ attributes: { caption_template: 'shock' } }), 'narrator', 'x');
    expect(__testing.captionDecoColor(spark, undefined)).toBe('#ffe98a');
    expect(__testing.captionDecoColor(impact, undefined)).toBe('#ffffff');
    expect(__testing.wordsIn('  one   two ')).toEqual(['one', 'two']);
    expect(__testing.captionLineStartFrames(['one two', 'three'], [{ word: 'one', startMs: -100 } as never, { word: 'two', startMs: 10 } as never, { word: 'three', startMs: 1000 } as never], 4, 30)).toEqual([0, 30]);
    expect(__testing.captionLineStartFrames(['one'], [{ word: 'one', startMs: Number.NaN } as never], 4, 30)).toEqual([0]);
    expect(__testing.isMetricKeyword('10%')).toBe(true);
    expect(__testing.isMetricKeyword('plain')).toBe(false);
  });

  test('renders caption word, line, sticker, lag, and hold variants', () => {
    const plainTemplate = __testing.resolveCaptionTemplate(makeClip({ attributes: { caption_template: 'plain' } }), 'narrator', 'plain');
    const metricTemplate = __testing.resolveCaptionTemplate(makeClip({ attributes: { caption_template: 'metric' } }), 'narrator', '10%');
    const wordCases = [
      { word: '10%', index: 0, totalWords: 2, keywordIndex: 0, emotional: true, keywordColor: '#f00', secondaryBlurPx: 0, template: metricTemplate },
      { word: 'wow', index: 0, totalWords: 1, keywordIndex: 0, emotional: false, keywordColor: '#f00', secondaryBlurPx: 0, template: plainTemplate },
      { word: 'plain', index: 1, totalWords: 2, keywordIndex: 0, emotional: false, keywordColor: undefined, secondaryBlurPx: 3, template: plainTemplate },
    ];
    for (const props of wordCases) {
      renderNode(React.createElement(__testing.CaptionWord, {
        ...props,
        markerGrow: 0.5,
        frame: 5,
        lineStart: 0,
        baseTextStyle: { textShadow: 'shadow' },
      } as never));
    }
    renderNode(React.createElement(__testing.CaptionLine, {
      line: 'plain longest', index: 0, totalLines: 1, lineStart: 0, captionFrame: 5,
      frame: 5, emotional: false, keywordColor: undefined, template: plainTemplate,
      baseTextStyle: {}, secondaryBlurPx: 2,
    } as never));

    const captionCases: Array<{ frame: number; scene: 'hook' | 'proof' | 'narrator' | 'cta'; clip: RenderClip }> = [
      { frame: 2, scene: 'hook', clip: makeClip({ trackKind: 'caption', assetKind: undefined, textContent: undefined, attributes: undefined }) },
      { frame: 8, scene: 'proof', clip: makeClip({ trackKind: 'caption', assetKind: undefined, textContent: '검증 후기!', attributes: { caption_type: 'reaction', caption_position: 'top' }, effects: [makeEffect('caption-style', { fontSize: 90, color: '#abc', background: '#000', fontWeight: 800 }), makeEffect('caption-flame', { opacity: 0.4 }), makeEffect('caption-glow', { color: '#0ff' }), makeEffect('caption-pop', { scale: 1.2 })] }) },
      { frame: 8, scene: 'narrator', clip: makeClip({ trackKind: 'caption', assetKind: undefined, textContent: 'plain words', attributes: { caption_type: 'footnote', caption_entrance_effect: 'fade-in', caption_lag_ms: 0, caption_hold_ms: 1000, caption_template: 'plain' }, effects: [makeEffect('sticker', { variant: 'ring' })] }) },
      { frame: 8, scene: 'cta', clip: makeClip({ trackKind: 'caption', assetKind: undefined, textContent: '지금 구매', attributes: { caption_type: 'sfx-emoji', caption_lag_ms: 0, caption_hold_ms: 1000 }, effects: [makeEffect('caption-border-sticker', { style: 'shadow' })] }) },
    ];
    for (const item of captionCases) {
      remotionState.frame = item.frame;
      renderNode(React.createElement(__testing.DynamicCaption, { clip: item.clip, transformStyle: {}, sceneType: item.scene } as never));
    }

    remotionState.frame = 0;
    expect(renderNode(React.createElement(__testing.DynamicCaption, {
      clip: makeClip({ trackKind: 'caption', assetKind: undefined, textContent: 'later', attributes: { caption_type: 'pd-aside' } }),
      transformStyle: {}, sceneType: 'narrator',
    } as never))).toBe('');
    remotionState.frame = 4;
    expect(renderNode(React.createElement(__testing.DynamicCaption, {
      clip: makeClip({ trackKind: 'caption', assetKind: undefined, textContent: 'gone', attributes: { caption_type: 'reaction', caption_lag_ms: 0, caption_hold_ms: 100 } }),
      transformStyle: {}, sceneType: 'narrator',
    } as never))).toBe('');
  });

  test('covers emoji, watermark, ducking, and clip routing boundaries', () => {
    expect(__testing.applyEmojiEntrance('pop', 0).opacity).toBe(0);
    expect(__testing.applyEmojiEntrance('bounce', 0.8).opacity).toBe(1);
    expect(__testing.applyEmojiEntrance('pop', 2)).toEqual({ opacity: 1, transform: 'scale(1)' });
    remotionState.frame = 1;
    renderNode(<__testing.EmojiOverlay effect={{ kind: 'emoji-overlay' } as Effect} fps={30} />);
    renderNode(<__testing.EmojiOverlay effect={makeEffect('emoji-overlay', { position: 'missing', mode: 'floating', holdMs: 0 })} fps={30} />);

    renderNode(<__testing.Watermark clip={makeClip({ textContent: undefined, effects: [makeEffect('watermark', { mode: 'single', position: 'missing' })] })} containerStyle={{}} />);
    const duck = __testing.buildMusicVolumeFn(1, 0.5, 30, [{ startMs: 1000, endMs: 2000 }]);
    expect(duck(0)).toBe(1);
    expect(duck(30)).toBeLessThan(1);
    expect(duck(45)).toBe(0.5);
    expect(duck(75)).toBeLessThanOrEqual(1);
    expect(__testing.buildMusicVolumeFn(0.2, 3, 30, [])(0)).toBe(0.2);

    expect(__testing.clipIsVisual(makeClip({ assetKind: 'image' }), false)).toBe(true);
    expect(__testing.clipIsVisual(makeClip({ assetKind: 'video' }), false)).toBe(true);
    expect(__testing.clipIsVisual(makeClip({ assetKind: undefined, trackKind: 'overlay', url: 'x' }), false)).toBe(true);
    expect(__testing.clipIsVisual(makeClip({ assetKind: undefined, trackKind: 'overlay', url: undefined }), false)).toBe(false);
    expect(__testing.clipIsVisual(makeClip({ assetKind: undefined, trackKind: 'overlay', url: 'x' }), true)).toBe(false);
    const style: React.CSSProperties = {};
    __testing.applyEffectStyle(style, { opacity: 1, filter: 'blur(1px)', transform: '', clipPath: 'circle()', blendMode: 'screen' } as never);
    expect(style).toMatchObject({ filter: 'blur(1px)', clipPath: 'circle()', mixBlendMode: 'screen' });
    const emptyStyle: React.CSSProperties = {};
    __testing.applyEffectStyle(emptyStyle, { opacity: 1, filter: '', transform: '', clipPath: '', blendMode: 'normal' } as never);

    const visualRuntime = makeRuntime();
    const audioRuntime = makeRuntime({ isAudioAsset: true, isVisualAsset: false });
    expect(__testing.clipIsAudio(makeClip(), audioRuntime as never)).toBe(true);
    for (const trackKind of ['audio', 'music', 'sfx'] as const) {
      expect(__testing.clipIsAudio(makeClip({ assetKind: undefined, trackKind }), visualRuntime as never)).toBe(true);
    }
    expect(__testing.clipIsAudio(makeClip(), visualRuntime as never)).toBe(false);

    expect(renderNode(React.createElement(__testing.AudioClipRenderer, { clip: makeClip({ trackKind: 'audio', assetKind: 'audio', url: undefined }), mix: undefined, voiceWindows: [], runtime: audioRuntime } as never))).toBe('');
    renderNode(React.createElement(__testing.AudioClipRenderer, { clip: makeClip({ trackKind: 'music', assetKind: 'audio', url: 'music.mp3', inMs: undefined, outMs: undefined }), mix: { autoDuck: true }, voiceWindows: [{ startMs: 0, endMs: 1000 }], runtime: audioRuntime } as never));
    renderNode(React.createElement(__testing.AudioClipRenderer, { clip: makeClip({ trackKind: 'sfx', assetKind: 'audio', url: 'sfx.mp3', inMs: 100, outMs: 900 }), mix: undefined, voiceWindows: [], runtime: audioRuntime } as never));
    renderNode(React.createElement(__testing.TitleClipRenderer, { clip: makeClip({ trackKind: 'title', assetKind: undefined, textContent: undefined }), runtime: visualRuntime } as never));
    renderNode(React.createElement(__testing.TitleClipRenderer, { clip: makeClip({ trackKind: 'title', assetKind: undefined, effects: [makeEffect('watermark')] }), runtime: visualRuntime } as never));
    renderNode(React.createElement(__testing.CaptionClipRenderer, { clip: makeClip({ trackKind: 'caption', assetKind: undefined, textContent: 'caption', effects: [makeEffect('watermark')] }), runtime: visualRuntime } as never));
  });

  test('covers sub-images, motion, crop, media, and missing visuals', () => {
    expect(__testing.clipIsVideo(makeClip({ assetKind: 'video', url: undefined }))).toBe(true);
    expect(__testing.clipIsVideo(makeClip({ assetKind: 'image', url: 'x.webm?q=1' }))).toBe(true);
    expect(__testing.clipIsVideo(makeClip({ assetKind: 'image', url: undefined }))).toBe(false);
    const none = __testing.resolveSubImageState(makeClip({ attributes: { sub_images: 'bad' } }), false, 0, 30);
    const multiple = __testing.resolveSubImageState(makeClip({ assetKind: 'image', attributes: { sub_images: ['', 1, 'a.jpg', 'b.jpg'] } }), false, 25, 30);
    const videoSubs = __testing.resolveSubImageState(makeClip({ assetKind: 'video', attributes: { sub_images: ['a', 'b'] } }), true, 5, 30);
    expect(none.hasMultiple).toBe(false);
    expect(multiple.hasMultiple).toBe(true);
    expect(videoSubs.hasMultiple).toBe(false);
    expect(__testing.hasMotionKeyframes(makeClip({ keyframes: undefined }))).toBe(false);
    expect(__testing.hasMotionKeyframes(makeClip({ keyframes: [{ property: 'opacity', timeMs: 0, value: 1 }] }))).toBe(false);
    for (const property of ['scale', 'x', 'y'] as const) {
      expect(__testing.hasMotionKeyframes(makeClip({ keyframes: [{ property, timeMs: 0, value: 1 }] }))).toBe(true);
    }
    expect(__testing.resolveMotionClipId(makeClip({ id: 'a' }), { ...multiple, activeIndex: 1 } as never, 2)).toContain('_sub_1');
    expect(__testing.resolveMotionClipId(makeClip({ id: 'a' }), none as never, 2)).toBe('a_beat_2');
    expect(__testing.resolveMotionClipId(makeClip({ id: 'a' }), none as never, -1)).toBe('a');

    const baseRuntime = makeRuntime();
    expect(__testing.resolveAmbientMotion(makeClip(), baseRuntime as never, true, none as never, '', -1, false)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(__testing.resolveAmbientMotion(makeClip(), baseRuntime as never, false, none as never, '', -1, true)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(__testing.resolveAmbientMotion(makeClip({ effects: [makeEffect('ken-burns')] }), baseRuntime as never, false, none as never, '', -1, false)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(__testing.resolveAmbientMotion(makeClip({ attributes: { subshot_count: 2 } }), baseRuntime as never, false, none as never, '', -1, false).scale).toBeGreaterThan(0);
    for (const args of [
      [makeRuntime({ scale: 2 }), ''],
      [baseRuntime, 'contain'],
      [baseRuntime, 'cover'],
      [makeRuntime({ x: 1 }), ''],
      [makeRuntime({ y: 1 }), ''],
    ] as const) {
      expect(__testing.resolveAmbientMotion(makeClip(), args[0] as never, false, none as never, args[1], -1, false)).toEqual({ scale: 1, x: 0, y: 0 });
    }
    expect(__testing.resolveAmbientMotion(makeClip(), baseRuntime as never, false, multiple as never, '', 1, false).scale).toBeGreaterThan(0);
    expect(__testing.resolveAmbientMotion(makeClip(), baseRuntime as never, false, none as never, '', -1, false).scale).toBeGreaterThan(0);

    const cropCases = [
      __testing.resolveCropPolicy(makeClip({ attributes: { render_mode: 'product_solo' } }), makeRuntime({ scale: 0.5 }) as never, false),
      __testing.resolveCropPolicy(makeClip({ attributes: { provider: 'seedream-4', subject_zoom: 2 } }), baseRuntime as never, false),
      __testing.resolveCropPolicy(makeClip({ attributes: { provider_model: 'piapi', full_frame: true, subject_zoom: 2 } }), baseRuntime as never, false),
      __testing.resolveCropPolicy(makeClip({ attributes: { render_mode: 'persona' } }), baseRuntime as never, false),
      __testing.resolveCropPolicy(makeClip({ attributes: { no_subject_zoom: true } }), baseRuntime as never, false),
      __testing.resolveCropPolicy(makeClip(), baseRuntime as never, true),
    ];
    expect(cropCases.some((crop) => crop.forceCover)).toBe(true);
    expect(cropCases.some((crop) => crop.mediaScale > 1)).toBe(true);
    expect(__testing.combineVisualFilter(null, { filter: 'contrast(1)' })).toBe('contrast(1)');
    expect(__testing.combineVisualFilter({ filter: 'blur(1px)' } as never, {})).toBe('blur(1px)');
    expect(__testing.buildVisualStyle(baseRuntime as never, { scale: 1, x: 0, y: 0 }, cropCases[0], null, '')).toHaveProperty('transform');
    expect(__testing.buildVisualStyle(baseRuntime as never, { scale: 1, x: 0, y: 0 }, cropCases[0], { transform: 'translate(0)', filter: '', opacity: 0.5 } as never, ' scale(1)')).toHaveProperty('opacity');

    const mediaPlans = [
      __testing.resolveMediaStyle(makeClip({ id: 'a!', attributes: { fit: 'contain', reframe: 'top' }, effects: [makeEffect('chroma-key', { similarity: 0.2 })] }), { effectiveScale: 1, mediaScale: 2, forceCover: false }, 'contain'),
      __testing.resolveMediaStyle(makeClip({ attributes: { reframe: 'left' }, effects: [{ ...makeEffect('chroma-key'), disabled: true } as Effect] }), { effectiveScale: 1, mediaScale: 1, forceCover: true }, ''),
      __testing.resolveMediaStyle(makeClip(), { effectiveScale: 1, mediaScale: 1, forceCover: false }, ''),
    ];
    expect(mediaPlans[0].chromaKey).not.toBeNull();
    expect(mediaPlans[1].chromaKey).toBeNull();

    renderNode(React.createElement(__testing.MissingVisual, { clip: makeClip({ url: undefined, textContent: undefined }), runtime: baseRuntime } as never));
    renderNode(React.createElement(__testing.MissingVisual, { clip: makeClip({ url: undefined, attributes: { social_proof_wording: 'Proof' } }), runtime: baseRuntime } as never));
    renderNode(React.createElement(__testing.VisualMedia, { clip: makeClip({ url: 'a.jpg' }), runtime: baseRuntime, isVideo: false, subImages: multiple, mediaStyle: {} } as never));
    renderNode(React.createElement(__testing.VisualMedia, { clip: makeClip({ url: 'a.mp4', inMs: undefined, outMs: undefined }), runtime: baseRuntime, isVideo: true, subImages: none, mediaStyle: {} } as never));
    renderNode(React.createElement(__testing.VisualMedia, { clip: makeClip({ url: 'a.mp4', inMs: 100, outMs: 900 }), runtime: baseRuntime, isVideo: true, subImages: none, mediaStyle: {} } as never));
    renderNode(React.createElement(__testing.VisualMedia, { clip: makeClip({ url: 'a.gif?x=1' }), runtime: baseRuntime, isVideo: false, subImages: none, mediaStyle: { objectFit: 'contain' } } as never));
    renderNode(React.createElement(__testing.VisualMedia, { clip: makeClip({ url: 'a.gif' }), runtime: baseRuntime, isVideo: false, subImages: none, mediaStyle: { objectFit: 'cover' } } as never));
    renderNode(React.createElement(__testing.VisualMedia, { clip: makeClip({ url: 'a.jpg' }), runtime: baseRuntime, isVideo: false, subImages: none, mediaStyle: {} } as never));
  });

  test('covers overlap, headline, and top-level sorting contracts', () => {
    const cap = (id: string, startMs: number, durationMs: number, textContent: string | undefined) => makeClip({ id, trackKind: 'caption', assetKind: undefined, startMs, durationMs, textContent });
    expect(__testing.resolveCaptionOverlaps([cap('a', 0, 100, 'a')])).toHaveLength(1);
    expect(__testing.resolveCaptionOverlaps([cap('b', 200, 100, 'b'), cap('a', 0, 100, 'a')])).toHaveLength(2);
    expect(__testing.resolveCaptionOverlaps([cap('a', 0, 500, undefined), cap('b', 100, 500, '')])).toHaveLength(1);
    expect(__testing.resolveCaptionOverlaps([cap('a', 0, 500, 'same'), cap('b', 100, 500, ' same ')])).toHaveLength(1);
    expect(__testing.resolveCaptionOverlaps([cap('a', 0, 500, 'a'), cap('b', 50, 500, 'b')]).some((clip) => clip.id === 'a')).toBe(false);
    const truncated = __testing.resolveCaptionOverlaps([cap('a', 0, 500, 'a'), cap('b', 200, 500, 'b'), makeClip({ id: 'other' })]);
    expect(truncated.find((clip) => clip.id === 'a')?.durationMs).toBe(200);
    expect(truncated.find((clip) => clip.id === 'other')).toBeTruthy();
    expect(__testing.resolveCaptionOverlaps([cap('b', 0, 100, 'b'), cap('a', 0, 100, 'a')])).toHaveLength(1);

    expect(__testing.clampHeadlineTitleToHook([makeClip()])).toHaveLength(1);
    expect(__testing.clampHeadlineTitleToHook([cap('c', -100, 0, 'c')])).toHaveLength(1);
    const caption1 = cap('c1', 0, 500, 'c1');
    const caption2 = cap('c2', 500, 500, 'c2');
    const title = makeClip({ id: 'title', trackKind: 'title', assetKind: undefined, startMs: 0, durationMs: 2000 });
    const titleLate = makeClip({ id: 'late', trackKind: 'title', assetKind: undefined, startMs: 100, durationMs: 2000 });
    const titleShort = makeClip({ id: 'short', trackKind: 'title', assetKind: undefined, startMs: 0, durationMs: 500 });
    const watermark = makeClip({ id: 'wm', trackKind: 'title', assetKind: undefined, effects: [makeEffect('watermark')] });
    const clamped = __testing.clampHeadlineTitleToHook([title, titleLate, titleShort, watermark, caption2, caption1, makeClip({ id: 'other' })]);
    expect(clamped.find((clip) => clip.id === 'title')?.durationMs).toBe(500);
    expect(__testing.clampHeadlineTitleToHook([titleShort, caption1])).toEqual([titleShort, caption1]);

    remotionState.frame = 5;
    const clips = [
      makeClip({ id: 'bg', attributes: { scene_layer: 'background' }, startMs: 100 }),
      makeClip({ id: 'hero', attributes: { scene_layer: 'hero' }, startMs: 100 }),
      makeClip({ id: 'narrator', attributes: { scene_layer: 'narrator' }, startMs: 100 }),
      makeClip({ id: 'caption-layer', trackKind: 'caption', assetKind: undefined, textContent: 'x', attributes: { scene_layer: 'caption' }, startMs: 100 }),
      makeClip({ id: 'audio-layer', trackKind: 'audio', assetKind: 'audio', url: undefined, attributes: { scene_layer: 'audio' }, startMs: 100 }),
      makeClip({ id: 'wm', trackKind: 'title', assetKind: undefined, effects: [makeEffect('watermark')], startMs: 100 }),
    ];
    expect(renderNode(<TimelineCompositionV2 fps={30} width={1080} height={1920} durationMs={2000} aspect="9:16" mix={{ voice: 1, music: 0.15, sfx: 0.6 }} clips={clips} />)).toContain('div');
  });

  test('closes remaining render defaults without coverage exclusions', () => {
    remotionState.frame = 0;
    expect(renderNode(<__testing.CaptionDecoLayer deco={'unknown' as never} color="#fff" />)).toBe('');
    const colored = __testing.resolveCaptionTemplate(makeClip({ attributes: { caption_template: 'metric' } }), 'narrator', '10%');
    renderNode(React.createElement(__testing.CaptionWord, {
      word: '10%', index: 0, totalWords: 1, keywordIndex: 0, markerGrow: 0.5,
      frame: 0, lineStart: 0, emotional: false, keywordColor: '#f00', template: colored,
      baseTextStyle: {}, secondaryBlurPx: 0,
    } as never));

    const opacityCaption = makeClip({
      trackKind: 'caption', assetKind: undefined, textContent: 'caption',
      attributes: { caption_type: 'reaction', caption_lag_ms: 0, caption_hold_ms: 0, caption_entrance_effect: 'pop' },
      effects: [makeEffect('caption-border-sticker')],
    });
    for (const transformStyle of [{}, { opacity: 0.5 }]) {
      renderNode(React.createElement(__testing.DynamicCaption, { clip: opacityCaption, transformStyle, sceneType: 'narrator' } as never));
    }
    renderNode(React.createElement(__testing.DynamicCaption, {
      clip: makeClip({ trackKind: 'caption', assetKind: undefined, textContent: 'fallback', attributes: { caption_type: 'invalid', caption_lag_ms: 0, caption_hold_ms: 0 } as never }),
      transformStyle: {}, sceneType: 'narrator',
    } as never));

    const runtime = makeRuntime({ transformStyle: {} });
    renderNode(React.createElement(__testing.MissingVisual, { clip: makeClip({ url: undefined }), runtime } as never));
    const noAnchorCrop = { effectiveScale: 1, mediaScale: 2, forceCover: false };
    expect(__testing.resolveMediaStyle(makeClip({ attributes: undefined }), noAnchorCrop, '').style.objectPosition).toBe('center center');
    renderNode(React.createElement(__testing.VisualClipRenderer, {
      clip: makeClip({ trackKind: 'video', assetKind: undefined, url: 'a.jpg', effects: [makeEffect('chroma-key')] }),
      runtime: makeRuntime({ sceneLayer: 'narrator', isVisualAsset: false }),
    } as never));
    renderNode(React.createElement(__testing.VisualClipRenderer, {
      clip: makeClip({ trackKind: 'overlay', assetKind: undefined, url: 'a.jpg' }),
      runtime: makeRuntime({ sceneLayer: 'narrator', isVisualAsset: false }),
    } as never));

    const titleWithoutEffects = makeClip({ id: 'plain-title', trackKind: 'title', assetKind: undefined, effects: undefined, startMs: 0, durationMs: 2000 });
    const caption = makeClip({ id: 'cap', trackKind: 'caption', assetKind: undefined, effects: undefined, textContent: 'cap', startMs: 0, durationMs: 500 });
    expect(__testing.clampHeadlineTitleToHook([titleWithoutEffects, caption])[0].durationMs).toBe(500);
    expect(renderNode(<TimelineCompositionV2 fps={30} width={1080} height={1920} durationMs={1000} aspect="9:16" mix={{ voice: 1, music: 0.15, sfx: 0.6 }} clips={[makeClip({ effects: undefined, transforms: undefined, attributes: undefined })]} />)).toContain('div');

    expect(slidePanEntrance(1, 30, 'invalid' as never)).toHaveProperty('transform');
    const subshot = defaultAnimationRegistry.getPreset('subshot-drift');
    expect(subshot?.(2, 30, 10)).toHaveProperty('x');
    expect(cubicBezier(0, 0, 0, 1)(0.0005)).toBeGreaterThanOrEqual(0);

    expect(reelDocTesting.deriveDurationMs([{ type: 'audio', startTime: 0, duration: 100 } as never])).toBe(1000);
    expect(reelDocTesting.deriveDurationMs([{ type: 'video', duration: 2000 } as never])).toBe(2000);
    const localeFreeDoc = {
      id: 'locale-free', version: '1.0', schemaHash: 'hash', created: 'now', updated: 'now', title: 'Doc',
      outputFormat: { aspectRatio: '9:16', width: 1080, height: 1920, fps: '30' },
      elements: [],
    };
    expect(renderNode(<ReelDocCanvas reelDoc={localeFreeDoc as never} />)).toContain('div');
  });

  test('covers every element renderer default and animated value', () => {
    const registry = new AnimationRegistry();
    registry.registerPreset('all-values', () => ({ opacity: 0.5, scale: 1.2, x: 2, y: 3, rotation: 4 }));
    const animation = [{ type: 'preset', presetId: 'all-values', startTime: 0, duration: 1000 }];
    const props = (element: unknown) => ({
      element, fps: 30, frame: 0, durationMs: 1000, localeConfig: DEFAULT_LOCALE_CONFIG,
      animationRegistry: registry, variables: {},
    });

    expect(applyAnimations({ type: 'shape', id: 'none' } as never, 0, 30, registry)).toEqual({});
    const shape = { type: 'shape', id: 'shape-defaults', shapeType: 'rect', width: 10, height: 10, animations: animation };
    renderNode(React.createElement(ShapeElementRenderer, props(shape) as never));

    const text = {
      type: 'text', id: 'text-defaults', text: undefined, width: 100, fontSize: 30,
      fontFamily: '', color: '#fff', backgroundColor: '#000', blur: true, animations: animation,
    };
    renderNode(<LocaleConfigContext.Provider value={DEFAULT_LOCALE_CONFIG}>{React.createElement(TextElementRenderer, props(text) as never)}</LocaleConfigContext.Provider>);

    const video = {
      type: 'video', id: 'video-defaults', src: 'a.mp4', width: 100, height: 100,
      duration: 1000, rotation: undefined, animations: animation,
    };
    renderNode(React.createElement(VideoElementRenderer, props(video) as never));
  });
});

describe('TimelineCompositionV2 render surface', () => {
  test('renders all visual, text, audio, watermark, emoji, and fallback lanes', () => {
    const allEffects: Effect[] = [
      makeEffect('grain'),
      makeEffect('vignette'),
      makeEffect('glitch'),
      makeEffect('light-leak'),
      makeEffect('vhs-scanline'),
      makeEffect('particle'),
      makeEffect('light-sweep'),
      makeEffect('emoji-overlay', { emoji: '✨', position: 'top-left', entranceEffect: 'bounce' }),
    ];
    const clips: RenderClip[] = [
      makeClip({ id: 'image', url: 'https://example.com/a.jpg', attributes: { scene_type: 'hook', sub_images: ['a', 'b'], narrator_beat_index: 1 }, effects: allEffects }),
      makeClip({ id: 'video', assetKind: 'video', url: 'https://example.com/a.mp4', startMs: 100, attributes: { render_mode: 'persona' } }),
      makeClip({ id: 'gif', url: 'https://example.com/a.gif', startMs: 200 }),
      makeClip({ id: 'missing', url: undefined, textContent: 'placeholder', startMs: 300 }),
      makeClip({ id: 'proof', url: undefined, attributes: { social_proof_wording: '좋아요', social_proof_attribution: '고객' }, startMs: 400 }),
      makeClip({ id: 'title', trackKind: 'title', assetKind: undefined, textContent: 'Title', startMs: 500 }),
      makeClip({ id: 'watermark', trackKind: 'title', assetKind: undefined, textContent: 'WM', effects: [makeEffect('watermark', { mode: 'boxed' })], startMs: 600 }),
      makeClip({ id: 'caption', trackKind: 'caption', assetKind: undefined, textContent: '지금 10% 할인', attributes: { caption_type: 'reaction', caption_position: 'mid' as never }, startMs: 700 }),
      makeClip({ id: 'voice', trackKind: 'audio', assetKind: 'audio', url: 'https://example.com/v.mp3', startMs: 0 }),
      makeClip({ id: 'music', trackKind: 'music', assetKind: 'audio', url: 'https://example.com/m.mp3', startMs: 0 }),
      makeClip({ id: 'music-duplicate', trackKind: 'music', assetKind: 'audio', url: 'https://example.com/m.mp3', startMs: 0 }),
    ];
    const props: RenderProps = {
      fps: 30,
      width: 1080,
      height: 1920,
      durationMs: 3000,
      aspect: '9:16',
      locale: 'en',
      mix: { voice: 1, music: 0.2, sfx: 0.6, autoDuck: true, duck: 0.7 },
      clips,
    };
    for (const frame of [0, 3, 10, 20, 40]) {
      remotionState.frame = frame;
      expect(renderToStaticMarkup(<TimelineCompositionV2 {...props} />)).toContain('div');
    }
  });

  test('renders caption decorations, emoji positions, watermarks, and utility components', () => {
    for (const deco of ['none', 'flame', 'spark', 'impact', 'drops', 'doubt', 'beat'] as const) {
      remotionState.frame = 17;
      renderToStaticMarkup(<__testing.CaptionDecoLayer deco={deco} color="#fff" />);
    }
    for (const effect of ['pop', 'scale-pop', 'bounce', 'other']) {
      expect(__testing.applyEmojiEntrance(effect, 0.5)).toHaveProperty('transform');
    }
    const emojiEffects = [
      makeEffect('emoji-overlay', { position: 'top-right', mode: 'floating' }),
      makeEffect('emoji-overlay', { position: 'bottom-center', mode: 'inline' }),
      makeEffect('emoji-overlay', { position: 'missing', mode: 'inline' }),
      makeEffect('emoji-overlay', { position: 'missing', mode: 'other' }),
      makeEffect('emoji-overlay', { position: 'missing' }),
    ];
    for (const effect of emojiEffects) {
      remotionState.frame = 1;
      renderToStaticMarkup(<__testing.EmojiOverlay effect={effect} fps={30} />);
    }
    renderToStaticMarkup(<__testing.EmojiOverlay effect={makeEffect('emoji-overlay', { position: 'top-left', holdMs: 1 })} fps={30} />);
    renderToStaticMarkup(<__testing.EmojiOverlay effect={makeEffect('emoji-overlay', { position: { x: 25, y: 75 } as never })} fps={30} />);

    const watermarkModes = [
      makeEffect('watermark', { mode: 'single', position: 'tl', text: 'A' }),
      makeEffect('watermark', { mode: 'single', url: 'https://example.com/logo.png', size: 10 }),
      makeEffect('watermark', { mode: 'boxed' }),
      makeEffect('watermark', { mode: 'repeated' }),
    ];
    for (const effect of watermarkModes) {
      renderToStaticMarkup(<__testing.Watermark clip={makeClip({ effects: [effect] })} containerStyle={{ opacity: 0.5 }} />);
    }
    expect(__testing.Watermark({ clip: makeClip(), containerStyle: {} })).toBeNull();
    renderToStaticMarkup(<__testing.TestimonialCard wording="Proof" attribution="Person" accentColor="#f00" />);
    renderToStaticMarkup(<__testing.TestimonialCard wording="Proof" attribution="" accentColor="#f00" />);
    renderToStaticMarkup(<__testing.ProofStars />);
  });
});

describe('cinematic effect modules', () => {
  test('covers grain, leak, sweep, punch, pan, split, and ramp phases', () => {
    remotionState.frame = 45;
    expect(renderToStaticMarkup(<FilmGrain />)).toContain('film-grain-filter');
    expect(renderToStaticMarkup(<FilmGrain opacity={0.2} blend="soft-light" />)).toContain('svg');
    expect(computeFilmGrainOpacity(1, 30, 10, 50)).toBeLessThan(0.08);
    expect(computeFilmGrainOpacity(20, 30, 10, 50)).toBe(0.08);
    expect(computeFilmGrainOpacity(60, 30, 10, 50)).toBeGreaterThanOrEqual(0);
    expect(computeFilmGrainOpacity(100, 30, 10, 50)).toBe(0);

    const triggers = [10, 30, 50, 70];
    for (const frame of [0, 7, 10, 13, 30, 50, 70]) {
      remotionState.frame = frame;
      expect(renderToStaticMarkup(<LightLeak triggerFrames={triggers} windowFrames={10} />)).toContain('div');
    }
    for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
      remotionState.frame = 10;
      renderToStaticMarkup(<LightLeak triggerFrames={[10]} edge={edge} color="#fff" />);
    }

    expect(renderToStaticMarkup(<LightSweep frame={0} durationInFrames={100} />)).toBe('');
    expect(renderToStaticMarkup(<LightSweep frame={12} durationInFrames={100} frames={0} width={100} opacity={2} />)).toContain('div');
    expect(renderToStaticMarkup(<LightSweep frame={-3} durationInFrames={100} frames={10} loop />)).toContain('div');
    expect(renderToStaticMarkup(<LightSweep frame={200} durationInFrames={100} />)).toBe('');

    for (const frame of [0, 15, 16, 18, 25, 40]) {
      expect(punchInTransform(frame, 30, 30)).toContain('scale');
    }
    expect(punchInStyle(16, 30, 30, { at: 0.25, zoom: 1.3, settle: 1 })).toHaveProperty('transformOrigin');
    remotionState.frame = 16;
    expect(renderToStaticMarkup(<PunchInContainer durationInFrames={30}><span>x</span></PunchInContainer>)).toContain('x');
    expect(renderToStaticMarkup(<PunchInContainer durationInFrames={30} style={{ color: 'red' }} opts={{ at: 0.2 }}><span>x</span></PunchInContainer>)).toContain('red');

    for (let index = -4; index < 8; index += 1) expect(pickDirection(index)).toBeTruthy();
    for (const direction of ['left', 'right', 'up', 'down'] as const) {
      expect(slidePanEntrance(0, 30, direction)).toHaveProperty('transform');
      expect(slidePanEntrance(20, 30, direction, { frames: 4, distance: 20 })).toHaveProperty('filter');
      remotionState.frame = 2;
      renderToStaticMarkup(<SlidePanEntrance direction={direction} frames={4} distance={8}><span>x</span></SlidePanEntrance>);
    }

    expect(chromaticSplitFilter(0)).toContain('drop-shadow');
    expect(chromaticSplitFilter(3, { intensity: -2, alpha: 2, pulse: false, axis: 'x' })).toContain('rgba');
    expect(chromaticSplitFilter(3, { intensity: 30, alpha: -1, pulse: true, axis: 'y' })).toContain('px');

    for (const direction of ['left', 'right', 'up', 'down', 'none', 'invalid']) {
      expect(speedRampStyle(5, 10, { at: 0.5, frames: 4, intensity: 100, blur: -1, zoom: 2, direction })).toHaveProperty('transform');
      expect(speedRampStyle(7, 10, { at: 0.5, frames: 4, direction })).toHaveProperty('filter');
    }
    expect(speedRampStyle(-1, 10)).toEqual({ transform: '', filter: '' });
    expect(speedRampStyle(100, 10)).toEqual({ transform: '', filter: '' });
    expect(speedRampStyle(7, 10, { frames: 0, intensity: -1, blur: 2, zoom: 0 })).toHaveProperty('transform');
  });
});

describe('ReelDoc interpreter and animation library', () => {
  const baseRendererProps = (element: unknown, extras: Record<string, unknown> = {}) => ({
    element,
    fps: 30,
    frame: 5,
    durationMs: 1000,
    brandKit: undefined,
    localeConfig: DEFAULT_LOCALE_CONFIG,
    animationRegistry: defaultAnimationRegistry,
    variables: {},
    ...extras,
  });

  test('covers every easing and every built-in motion preset', () => {
    const bezier = cubicBezier(0.25, 0.1, 0.25, 1);
    expect(bezier(-1)).toBe(0);
    expect(bezier(2)).toBe(1);
    expect(bezier(0.5)).toBeGreaterThan(0);
    expect(cubicBezier(0, 0, 0, 0)(0.001)).toBeGreaterThanOrEqual(0);
    for (const easing of Object.values(EASING_FN)) {
      for (const value of [0, 0.25, 0.5, 0.75, 1]) expect(Number.isFinite(easing(value))).toBe(true);
    }
    expect(getEasing('ease-out')).toBe(EASING_FN['ease-out']);
    expect(getEasing('missing')).toBe(EASING_FN.linear);
    expect(getEasing(undefined)).toBe(EASING_FN.linear);

    const registry = new AnimationRegistry();
    for (const id of registry.listPresets()) {
      const preset = registry.getPreset(id);
      expect(preset).not.toBeNull();
      for (const frame of [0, 1, 3, 5, 9, 12]) {
        for (const intensity of [undefined, 'subtle', 'medium', 'strong'] as const) {
          expect(preset?.(frame, 30, 10, intensity)).toBeTruthy();
        }
      }
    }
    expect(registry.getPreset('missing')).toBeNull();
    registry.registerPreset('custom', () => ({ opacity: 0.5 }));
    expect(registry.getPreset('custom')?.(0, 30, 10)).toEqual({ opacity: 0.5 });
  });

  test('covers keyframe animation and renderer registries', () => {
    expect(evaluateKfProperty([], 0, 'opacity')).toBeUndefined();
    expect(evaluateKfProperty([{ time: 0, opacity: 'bad' }, { time: 100, opacity: 1 }], 50, 'opacity')).toBeUndefined();
    expect(evaluateKfProperty([{ time: 0, opacity: 0 }, { time: 0, opacity: 1 }], 0, 'opacity')).toBe(0);
    expect(evaluateKfProperty([{ time: 0, opacity: 0, easing: 'ease-out' }, { time: 100, opacity: 1 }], 50, 'opacity')).toBeGreaterThan(0);
    expect(evaluateKfProperty([{ time: 0, opacity: 0 }, { time: 100, opacity: 1 }], 150, 'opacity', 'linear')).toBeGreaterThan(1);

    const registry = new ElementRendererRegistry();
    expect(registry.get('video')).toBeNull();
    registry.register('audio', () => null);
    expect(registry.get('audio')).not.toBeNull();

    const animated = {
      type: 'video', id: 'animated', src: 'https://example.com/a.mp4', duration: 1000,
      x: 0, y: 0, width: 100, height: 100,
      animations: [
        { type: 'preset', presetId: 'fade-in', startTime: 0, duration: 1000, intensity: 'medium' },
        { type: 'preset', presetId: 'missing', startTime: 0, duration: 1000, intensity: 'medium' },
        { type: 'property', startTime: 0, duration: 1000, easing: 'linear', keyframes: [{ time: 0 }, { time: 100, scale: 2, x: 1, y: 2, opacity: 0.5, rotation: 3 }] },
        { type: 'property', startTime: 0, duration: 1000, easing: 'linear', keyframes: [] },
      ],
    };
    expect(applyAnimations(animated as never, 15, 30, defaultAnimationRegistry)).toBeTruthy();
    expect(applyAnimations(animated as never, -10, 30, defaultAnimationRegistry)).toEqual({});
    expect(applyAnimations({ ...animated, animations: undefined } as never, 0, 30, defaultAnimationRegistry)).toEqual({});
  });

  test('renders all element renderer variants', () => {
    const image = { type: 'video', id: 'image', src: 'https://example.com/a.png?x=1', duration: 1000, x: 0, y: 0, width: 100, height: 100, animations: [] };
    const video = { ...image, id: 'video', src: 'https://example.com/a.mp4', loop: false, startFrom: 100, muted: true, volume: 0.5, opacity: 0.8, scale: 1.2, rotation: 4, zIndex: 2, fit: 'contain' };
    const loopVideo = { ...video, id: 'loop', loop: true, duration: 0 };
    for (const element of [image, video, loopVideo]) {
      const node = React.createElement(
        VideoElementRenderer,
        baseRendererProps(element) as React.ComponentProps<typeof VideoElementRenderer>,
      );
      expect(renderToStaticMarkup(node)).toContain('span');
    }

    const brandKit = {
      id: 'brand', name: 'Brand', colors: { primary: '#112233' },
      fonts: { heading: { family: 'Brand Font', weights: ['700'], fallback: 'sans-serif' } },
    };
    const richText = {
      type: 'text', id: 'text', text: 'Hello {name}', x: 1, y: 2, width: 90, height: 20,
      fontSize: 40, fontFamily: '{{brand.fonts.heading.family}}', fontWeight: '700',
      color: '{{brand.colors.primary}}', textAlign: 'left', lineHeight: 1.2, letterSpacing: 1,
      textDecoration: 'underline', backgroundColor: '#ffffff', padding: 0, borderRadius: 0,
      opacity: 0.5, zIndex: 3, blur: true, blurAmount: 0, animations: [],
    };
    const textNode = React.createElement(
      TextElementRenderer,
      baseRendererProps(richText, { brandKit, variables: { name: 'World' } }) as React.ComponentProps<typeof TextElementRenderer>,
    );
    expect(renderToStaticMarkup(<LocaleConfigContext.Provider value={DEFAULT_LOCALE_CONFIG}>{textNode}</LocaleConfigContext.Provider>)).toContain('Hello World');
    const plainText = { ...richText, id: 'plain', text: '', height: undefined, backgroundColor: undefined, lineHeight: undefined, letterSpacing: undefined, textDecoration: undefined, blur: false, fontFamily: 'Arial', color: '#ffffff', fontWeight: undefined, textAlign: undefined, opacity: undefined, zIndex: undefined };
    const plainNode = React.createElement(
      TextElementRenderer,
      baseRendererProps(plainText, { localeConfig: undefined, variables: undefined }) as React.ComponentProps<typeof TextElementRenderer>,
    );
    renderToStaticMarkup(<LocaleConfigContext.Provider value={DEFAULT_LOCALE_CONFIG}>{plainNode}</LocaleConfigContext.Provider>);

    const shapeBase = { type: 'shape', id: 'shape', shapeType: 'rect', x: 0, y: 0, width: 50, height: 50, animations: [] };
    const shapes = [
      shapeBase,
      { ...shapeBase, id: 'solid', fill: { type: 'solid', color: '#fff' }, stroke: { width: 2, color: '#000' }, borderRadius: 0, opacity: 0.5, rotation: 2, zIndex: 2 },
      { ...shapeBase, id: 'gradient', fill: { type: 'gradient', gradient: {} }, shapeType: 'circle' },
      { ...shapeBase, id: 'triangle', shapeType: 'triangle' },
      { ...shapeBase, id: 'star', shapeType: 'star' },
      { ...shapeBase, id: 'line', shapeType: 'line' },
    ];
    for (const element of shapes) {
      const node = React.createElement(
        ShapeElementRenderer,
        baseRendererProps(element) as React.ComponentProps<typeof ShapeElementRenderer>,
      );
      renderToStaticMarkup(node);
    }
    expect(AudioElementRenderer(baseRendererProps({ type: 'audio' }) as never)).toBeNull();
    expect(defaultElementRendererRegistry.get('video')).not.toBeNull();
    expect(defaultElementRendererRegistry.get('text')).not.toBeNull();
    expect(defaultElementRendererRegistry.get('shape')).not.toBeNull();
    expect(defaultElementRendererRegistry.get('audio')).not.toBeNull();
  });

  test('renders ReelDocCanvas branches and converts legacy render props', () => {
    const doc = {
      id: 'doc', version: '1.0', schemaHash: 'hash', created: 'now', updated: 'now', title: 'Doc',
      outputFormat: { aspectRatio: '9:16', width: 1080, height: 1920, fps: '30' },
      metadata: { locale: 'en' },
      elements: [
        { type: 'video', id: 'image', src: 'https://example.com/a.jpg', duration: 500, x: 0, y: 0, width: 100, height: 100, animations: [] },
        { type: 'text', id: 'text', text: 'Hi', x: 0, y: 0, width: 100, fontSize: 30, fontFamily: 'Arial', color: '#fff', animations: [] },
        { type: 'audio', id: 'audio', src: 'https://example.com/a.mp3', startTime: 100, duration: 2000, volume: undefined, loop: undefined },
      ],
    };
    remotionState.frame = 5;
    expect(renderToStaticMarkup(<ReelDocCanvas reelDoc={doc as never} variables={{}} />)).toContain('div');
    expect(renderToStaticMarkup(<ReelDocCanvas reelDoc={{ ...doc, outputFormat: { ...doc.outputFormat, durationMs: 3000 } } as never} locale="ko" brandKit={{} as never} />)).toContain('div');

    expect(reelDocTesting.msToFrame(-10, 30)).toBe(0);
    expect(reelDocTesting.msToFrame(1000, 30)).toBe(30);
    expect(reelDocTesting.elementDurationMs({ duration: 500 } as never, 1000)).toBe(500);
    expect(reelDocTesting.elementDurationMs({} as never, 1000)).toBe(1000);
    expect(reelDocTesting.deriveDurationMs([])).toBe(1000);
    expect(reelDocTesting.deriveDurationMs(doc.elements as never)).toBe(2100);

    const missingRegistry = new ElementRendererRegistry();
    const bridge = React.createElement(reelDocTesting.ElementBridge, {
      ...baseRendererProps({ type: 'composition', id: 'nested' }),
      rendererRegistry: missingRegistry,
    } as React.ComponentProps<typeof reelDocTesting.ElementBridge>);
    expect(renderToStaticMarkup(<LocaleConfigContext.Provider value={DEFAULT_LOCALE_CONFIG}>{bridge}</LocaleConfigContext.Provider>)).toBe('');

    const clips = [
      makeClip({ id: 'visual', trackKind: 'video', url: 'https://example.com/v.mp4', transforms: undefined as never, volume: undefined }),
      makeClip({ id: 'visual-missing', trackKind: 'video', url: undefined }),
      makeClip({ id: 'caption', trackKind: 'caption', assetKind: undefined, textContent: 'Caption' }),
      makeClip({ id: 'caption-empty', trackKind: 'title', assetKind: undefined, textContent: '' }),
      makeClip({ id: 'overlay', trackKind: 'overlay', assetKind: undefined, textContent: 'Overlay' }),
      makeClip({ id: 'audio', trackKind: 'audio', assetKind: 'audio', url: 'https://example.com/a.mp3' }),
      makeClip({ id: 'music', trackKind: 'music', assetKind: 'audio', url: 'https://example.com/m.mp3' }),
      makeClip({ id: 'sfx', trackKind: 'sfx', assetKind: 'audio', url: 'https://example.com/s.mp3' }),
      makeClip({ id: 'audio-missing', trackKind: 'audio', assetKind: 'audio', url: undefined }),
      makeClip({ id: 'unknown', trackKind: 'unknown' as never }),
    ];
    const renderProps = {
      fps: 30, width: 1080, height: 1920, durationMs: 3000, aspect: '9:16',
      locale: 'en', mix: { voice: 1, music: 0.2, sfx: 0.6 }, clips,
    } as RenderProps;
    const adapted = renderPropsToReelDoc(renderProps);
    expect(adapted.elements.length).toBeGreaterThan(0);
    expect(adapted.metadata).toEqual({ locale: 'en' });
    expect(renderPropsToReelDoc({ ...renderProps, locale: null, aspect: undefined as never }).metadata).toBeUndefined();

    expect(resolveLocaleConfig(' en-US ')).toBe(resolveLocaleConfig('en'));
    expect(resolveLocaleConfig(null)).toBe(DEFAULT_LOCALE_CONFIG);
    expect(resolveLocaleConfig('unknown')).toBe(DEFAULT_LOCALE_CONFIG);
    expect(publicApi.ASPECT_DIMENSIONS['16:9'].width).toBe(1920);
    expect(publicApi.DEFAULT_FPS).toBe(30);
  });
});
