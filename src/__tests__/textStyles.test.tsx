import * as React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { RenderClip } from '@hiob/timeline';

const cleanupHolder = vi.hoisted(() => ({ capture: undefined as undefined | ((fn: () => void) => void) }));
const state = vi.hoisted(() => ({
  frame: 0,
  width: 1080,
  height: 1920,
  delay: vi.fn(() => 7),
  cont: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  // Run effects synchronously so FontGate's loader is exercised during static render.
  const useEffect = (fn: () => void | (() => void)) => {
    const cleanup = fn();
    if (typeof cleanup === 'function') cleanupHolder.capture?.(cleanup);
  };
  return { ...actual, default: actual, useEffect };
});

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  const ReactModule = await import('react');
  const container = ({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) =>
    ReactModule.createElement('div', { style }, children);
  return {
    ...actual,
    AbsoluteFill: container,
    useCurrentFrame: () => state.frame,
    useVideoConfig: () => ({ fps: 30, width: state.width, height: state.height, durationInFrames: 300, id: 'test' }),
    delayRender: state.delay,
    continueRender: state.cont,
    cancelRender: state.cancel,
  };
});

vi.mock('@remotion/gif', () => ({ Gif: () => null }));
vi.mock('@remotion/google-fonts/BlackHanSans', () => ({ loadFont: () => ({ fontFamily: 'Mock Black Han Sans' }) }));

import {
  FontGate,
  MOODS,
  TEXT_STYLES,
  TEXT_STYLE_CATALOG,
  TEXT_STYLE_IDS,
  TextStyleCaption,
  TextStyleTitle,
  getTextStyle,
  isMood,
  textStylesForMood,
} from '../textStyles';
import { FONT, FONT_FAMILIES, FONT_KEYS, ensureFonts, facesFor, fontFaceUrl, resetFontCacheForTests } from '../textStyles/fonts';
import { countUpText } from '../textStyles/kits/lineKit';
import { __testing } from '../TimelineCompositionV2';
import * as publicApi from '../index';
import { DEFAULT_LOCALE_CONFIG } from '../localeConfig';

const catalogJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('../textStyles/catalog.json', import.meta.url)), 'utf8'),
) as { version: number; moods: string[]; styles: unknown[] };

const FRAMES = [0, 2, 4, 6, 9, 12, 16, 20, 26, 32, 40, 50, 60, 64, 70, 80, 100, 120, 145, 149, 160, 400];
const TITLES = ['9'.repeat(400) + '명', '단 3분이면\n김서림 끝', '안경 김서림\n이제 그만', '하나의 줄', '첫 줄\n\n셋째 줄', '1,250명이 고른 98% 만족', ''];
const CUES: { lines: string[]; emphasis?: string }[] = [
  { lines: ['렌즈에 한 번 뿌리고', '닦아내면 끝이에요'], emphasis: '한 번' },
  { lines: ['하루 종일 선명하게'], emphasis: '선명하게' },
  { lines: ['강조 없음 한 줄'] },
  { lines: ['강조가 줄에 없는 경우'], emphasis: '없는단어' },
  { lines: ['3시간 지나도 그대로', '두 번째 줄 텍스트가 꽤 길어서 줄바꿈이 필요한 경우입니다'], emphasis: '3시간' },
  { lines: ['STEP 1', '렌즈 양면에 한 번씩'] },
  { lines: ['렌즈를 닦아요', '2단계'], emphasis: '렌즈를 닦아요' },
  { lines: [] },
];

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

function makeClip(overrides: Partial<RenderClip> = {}): RenderClip {
  return {
    id: 'clip-1',
    trackKind: 'title',
    assetKind: undefined,
    zIndex: 1,
    startMs: 0,
    durationMs: 2000,
    inMs: 0,
    transforms: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    effects: [],
    keyframes: [],
    ...overrides,
  } as RenderClip;
}

const runtime = {
  fps: 30,
  frame: 0,
  durationInFrames: 60,
  transformStyle: { opacity: 1 },
  sceneType: 'narrator',
  localeConfig: DEFAULT_LOCALE_CONFIG,
} as never;

afterEach(() => {
  state.frame = 0;
  state.width = 1080;
  state.height = 1920;
  vi.unstubAllGlobals();
  resetFontCacheForTests();
});

describe('text style registry', () => {
  test('exposes 16 unique styles covering every mood', () => {
    expect(TEXT_STYLES).toHaveLength(16);
    expect(new Set(TEXT_STYLE_IDS).size).toBe(16);
    for (const mood of MOODS) expect(textStylesForMood(mood).length).toBeGreaterThan(0);
    for (const style of TEXT_STYLES) {
      expect(style.meta.situations.length).toBeGreaterThanOrEqual(3);
      expect(style.meta.nameKo).not.toBe('');
      expect(style.meta.description).not.toBe('');
      expect(style.fonts.length).toBeGreaterThan(0);
    }
  });

  test('catalog.json matches the registry exactly', () => {
    expect(catalogJson).toEqual({ version: 1, moods: [...MOODS], styles: JSON.parse(JSON.stringify(TEXT_STYLE_CATALOG)) });
  });

  test('declared fonts match the FONT keys each preset file uses', () => {
    for (const style of TEXT_STYLES) {
      const source = readFileSync(fileURLToPath(new URL(`../textStyles/presets/${style.meta.id}.tsx`, import.meta.url)), 'utf8');
      const used = [...new Set([...source.matchAll(/FONT\.([a-zA-Z]+)/g)].map((match) => match[1]))].sort();
      expect([...new Set(style.fonts.map((request) => request.split('@')[0]))].sort()).toEqual(used);
    }
  });

  test('lookup helpers', () => {
    expect(getTextStyle(' ledger ')?.meta.id).toBe('ledger');
    expect(getTextStyle('missing')).toBeUndefined();
    expect(getTextStyle(42)).toBeUndefined();
    expect(isMood('meme')).toBe(true);
    expect(isMood('sad')).toBe(false);
    expect(isMood(1)).toBe(false);
    expect(publicApi.TEXT_STYLE_IDS).toBe(TEXT_STYLE_IDS);
    expect(publicApi.getTextStyle).toBe(getTextStyle);
  });
});

describe('every style renders title and caption across the timeline', () => {
  for (const style of TEXT_STYLES) {
    test(style.meta.id, () => {
      for (const frame of FRAMES) {
        state.frame = frame;
        for (const text of TITLES) {
          for (const durationInFrames of [150, 12]) {
            expect(render(<style.Title text={text} durationInFrames={durationInFrames} />)).toContain('<');
          }
        }
        for (const cue of CUES) {
          for (const durationInFrames of [66, 10]) {
            expect(render(<style.Caption lines={cue.lines} emphasis={cue.emphasis} durationInFrames={durationInFrames} />)).toBeTypeOf('string');
          }
        }
      }
    });
  }
});

describe('fonts', () => {
  test('stacks and urls', () => {
    expect(FONT.notoSansKR).toBe('"HiobNotoSansKR", sans-serif');
    expect(FONT_KEYS).toHaveLength(Object.keys(FONT_FAMILIES).length);
    expect(fontFaceUrl('jua/Jua-Regular.ttf')).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/gh\/google\/fonts@[0-9a-f]{40}\/ofl\/jua\/Jua-Regular\.ttf$/);
  });

  test('loads each family once and retries a failed family', async () => {
    const added: string[] = [];
    let failNext = true;
    class FakeFontFace {
      constructor(public family: string, public source: string) {}
      load() {
        if (failNext && this.family === 'HiobJua') {
          failNext = false;
          return Promise.reject(new Error('network'));
        }
        return Promise.resolve(this);
      }
    }
    vi.stubGlobal('FontFace', FakeFontFace);
    vi.stubGlobal('document', { fonts: { add: (face: FakeFontFace) => added.push(face.family) } });

    await expect(ensureFonts(['jua'])).rejects.toThrow('network');
    await ensureFonts(['jua', 'nanumMyeongjo']);
    await ensureFonts(['jua', 'nanumMyeongjo']);
    expect(added.filter((family) => family === 'HiobJua')).toHaveLength(1);
    expect(added.filter((family) => family === 'HiobNanumMyeongjo')).toHaveLength(3);
    await ensureFonts(['gowunBatang@700']);
    expect(added.filter((family) => family === 'HiobGowunBatang')).toHaveLength(1);
  });

  test('weight requests select faces and reject unknown weights', () => {
    expect(facesFor('gowunBatang@700').map(({ face }) => face.weight)).toEqual(['700']);
    expect(facesFor('nanumMyeongjo')).toHaveLength(3);
    expect(() => facesFor('jua@900')).toThrow('no matching face');
  });

  test('a hung face times out instead of holding the render forever', async () => {
    vi.stubGlobal('FontFace', class { load() { return new Promise(() => undefined); } });
    vi.stubGlobal('document', { fonts: { add: () => undefined } });
    await expect(ensureFonts(['jua'], 5)).rejects.toThrow('timed out after 5ms');
  });

  test('every declared style font resolves to at least one face', () => {
    for (const style of TEXT_STYLES) for (const request of style.fonts) expect(facesFor(request).length).toBeGreaterThan(0);
  });
});

describe('countUpText', () => {
  test('counts plain quantities and leaves codes untouched', () => {
    expect(countUpText('1,250명 98%', 0.5)).toBe('625명 49%');
    expect(countUpText('2026년 출시', 1)).toBe('2026년 출시');
    expect(countUpText('2026년 출시', 0.5)).toBe('1013년 출시');
    expect(countUpText('010-1234-5678', 0.5)).toBe('010-1234-5678');
    expect(countUpText('007배송', 0.5)).toBe('007배송');
    expect(countUpText('1,2,3단계', 0.5)).toBe('1,2,3단계');
    expect(countUpText('3.5배', 0.5)).toBe('3.5배');
    expect(countUpText('12345678901명', 0.5)).toBe('12345678901명');
    expect(countUpText('글자만', 0.5)).toBe('글자만');
  });
});

describe('FontGate', () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  test('continues the render once fonts load (with one retry)', async () => {
    let calls = 0;
    class FlakyFontFace {
      constructor(public family: string) {}
      load() {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('blip')) : Promise.resolve(this);
      }
    }
    vi.stubGlobal('FontFace', FlakyFontFace);
    vi.stubGlobal('document', { fonts: { add: () => undefined } });
    state.cont.mockClear();
    state.cancel.mockClear();
    render(<FontGate fonts={['jua']}><span>ok</span></FontGate>);
    await flush();
    await flush();
    expect(state.cont).toHaveBeenCalledWith(7);
    expect(state.cancel).not.toHaveBeenCalled();
  });

  test('cancels the render when fonts keep failing', async () => {
    class BrokenFontFace {
      load() {
        return Promise.reject(new Error('down'));
      }
    }
    vi.stubGlobal('FontFace', BrokenFontFace);
    vi.stubGlobal('document', { fonts: { add: () => undefined } });
    state.cancel.mockClear();
    render(<FontGate fonts={['songMyung']}><span>x</span></FontGate>);
    await flush();
    await flush();
    expect(state.cancel).toHaveBeenCalledWith(expect.objectContaining({ message: 'down' }));
  });

  test('releases the hold when unmounted before fonts arrive', () => {
    vi.stubGlobal('FontFace', class { load() { return new Promise(() => undefined); } });
    vi.stubGlobal('document', { fonts: { add: () => undefined } });
    state.cont.mockClear();
    let cleanup: (() => void) | undefined;
    cleanupHolder.capture = (fn) => { cleanup = fn; };
    render(<FontGate fonts={['jua']}><span>x</span></FontGate>);
    cleanupHolder.capture = undefined;
    cleanup?.();
    expect(state.cont).toHaveBeenCalledWith(7);
  });

  test('cleanup after settling does not continue twice', async () => {
    vi.stubGlobal('FontFace', class { load() { return Promise.resolve(this); } });
    vi.stubGlobal('document', { fonts: { add: () => undefined } });
    state.cont.mockClear();
    let cleanup: (() => void) | undefined;
    cleanupHolder.capture = (fn) => { cleanup = fn; };
    render(<FontGate fonts={['doHyeon']}><span>x</span></FontGate>);
    cleanupHolder.capture = undefined;
    await flush();
    await flush();
    cleanup?.();
    expect(state.cont).toHaveBeenCalledTimes(1);
  });

  test('styled wrappers render through the gate', () => {
    vi.stubGlobal('FontFace', class { load() { return Promise.resolve(this); } });
    vi.stubGlobal('document', { fonts: { add: () => undefined } });
    const style = getTextStyle('slam-bar')!;
    expect(render(<TextStyleTitle style={style} text={'지금\n바로'} durationInFrames={60} />)).toContain('지금');
    expect(render(<TextStyleCaption style={style} lines={['오늘만 이 가격']} durationInFrames={60} />)).toContain('오늘만');
  });
});

describe('TimelineCompositionV2 wiring', () => {
  test('title and caption clips with a known text_style render the style', () => {
    vi.stubGlobal('FontFace', class { load() { return Promise.resolve(this); } });
    vi.stubGlobal('document', { fonts: { add: () => undefined } });
    state.frame = 40;
    const title = render(
      <__testing.TitleClipRenderer clip={makeClip({ textContent: '단 3분이면\n김서림 끝', attributes: { text_style: 'gold-serif' } })} runtime={runtime} />,
    );
    expect(title).toContain('김서림');
    const caption = render(
      <__testing.CaptionClipRenderer
        clip={makeClip({ trackKind: 'caption', textContent: '렌즈에 한 번\n닦아내면 끝', attributes: { text_style: 'highlight-marker', emphasis: ' 한 번 ' } })}
        runtime={runtime}
      />,
    );
    expect(caption).toContain('닦아내면');
    const blankEmphasis = render(
      <__testing.CaptionClipRenderer
        clip={makeClip({ trackKind: 'caption', textContent: undefined, attributes: { text_style: 'ledger', emphasis: '  ' } })}
        runtime={runtime}
      />,
    );
    expect(blankEmphasis).toBeTypeOf('string');
    const emptyTitle = render(<__testing.TitleClipRenderer clip={makeClip({ textContent: undefined, attributes: { text_style: 'ledger' } })} runtime={runtime} />);
    expect(emptyTitle).toBeTypeOf('string');
  });

  test('unknown style, non-vertical canvas and watermark keep the built-in path', () => {
    const builtIn = render(<__testing.TitleClipRenderer clip={makeClip({ textContent: '기본 제목', attributes: { text_style: 'nope' } })} runtime={runtime} />);
    expect(builtIn).toContain('기본 제목');
    state.width = 1920;
    state.height = 1080;
    const wide = render(<__testing.TitleClipRenderer clip={makeClip({ textContent: '가로 제목', attributes: { text_style: 'ledger' } })} runtime={runtime} />);
    expect(wide).toContain('가로 제목');
    state.width = 1080;
    state.height = 1080;
    state.width = 1080;
    state.height = 1920;
    const overlay = render(
      <__testing.CaptionClipRenderer clip={makeClip({ trackKind: 'overlay', textContent: '오버레이', attributes: { text_style: 'ledger' } })} runtime={runtime} />,
    );
    expect(overlay).toContain('오버레이');
    state.width = 1080;
    state.height = 1080;
    const square = render(<__testing.TitleClipRenderer clip={makeClip({ textContent: '정사각 제목', attributes: { text_style: 'ledger' } })} runtime={runtime} />);
    expect(square).toContain('정사각 제목');
  });
});
