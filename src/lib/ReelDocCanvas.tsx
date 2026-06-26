/**
 * ReelDocCanvas — the canonical pure interpreter.
 *
 * interpret(ReelDoc, frame) → Remotion element tree
 *
 * GUARANTEES:
 * 1. DETERMINISTIC: same ReelDoc + frame → same pixels in preview AND Lambda
 * 2. PURE: zero DB I/O, zero randomness, zero useEffect
 * 3. PARITY: identical code path between @remotion/player and Lambda
 * 4. TESTABLE: snapshot-testable per frame via @remotion/testing
 */
import * as React from 'react';
import { createContext, useContext } from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { ReelDoc, Element, BrandKit, AudioElement } from '@hiob/timeline/schema';
import { resolveLocaleConfig, DEFAULT_LOCALE_CONFIG, type LocaleConfig } from '../localeConfig';
import { defaultAnimationRegistry, type AnimationRegistry } from './animationRegistry';
import {
  defaultElementRendererRegistry,
  type ElementRendererRegistry,
} from './elementRenderers';

// Import all renderers so they self-register into defaultElementRendererRegistry
import './elementRenderers/VideoElementRenderer';
import './elementRenderers/TextElementRenderer';
import './elementRenderers/ShapeElementRenderer';
import './elementRenderers/AudioElementRenderer';

/** Locale context — threads locale config to all leaf renderers without prop drilling. */
export const LocaleConfigContext = createContext<LocaleConfig>(DEFAULT_LOCALE_CONFIG);

export interface ReelDocCanvasProps {
  reelDoc: ReelDoc;
  /** Canonical locale code (ko/en/zh-hant-tw). Absent → ko (byte-identical to legacy). */
  locale?: string | null;
  /** Overrides inline brandKit from the document. */
  brandKit?: BrandKit;
  /** Template variable overrides, e.g. { 'product.name': 'Hyaluron Cream' }. */
  variables?: Record<string, unknown>;
  /** Inject custom animation registry (defaults to defaultAnimationRegistry). */
  animationRegistry?: AnimationRegistry;
  /** Inject custom renderer registry (defaults to defaultElementRendererRegistry). */
  rendererRegistry?: ElementRendererRegistry;
}

/**
 * Pure interpreter: ReelDoc → Remotion element tree.
 *
 * Called identically by the Studio Player preview and by Modal/Lambda render.
 * No environment branching here — environment differences belong in callers.
 */
export const ReelDocCanvas: React.FC<ReelDocCanvasProps> = ({
  reelDoc,
  locale,
  brandKit,
  variables = {},
  animationRegistry = defaultAnimationRegistry,
  rendererRegistry = defaultElementRendererRegistry,
}) => {
  const { fps } = useVideoConfig();

  const effectiveLocale = locale ?? reelDoc.metadata?.locale ?? undefined;
  const localeConfig = resolveLocaleConfig(effectiveLocale);

  const { outputFormat, elements, brandKit: docBrandKit } = reelDoc;
  const effectiveBrandKit = brandKit ?? docBrandKit;

  const compDurationMs =
    outputFormat.durationMs ?? deriveDurationMs(elements);

  const audioElements = elements.filter(
    (e): e is AudioElement => e.type === 'audio',
  );
  const visualElements = elements.filter((e) => e.type !== 'audio');

  return (
    <LocaleConfigContext.Provider value={localeConfig}>
      <AbsoluteFill style={{ backgroundColor: '#000000', overflow: 'hidden' }}>
        {visualElements.map((el) => {
          const durMs = elementDurationMs(el, compDurationMs);
          const startFrame = 0; // Visual elements start at composition start (v1)
          const durFrames = Math.max(1, msToFrame(durMs, fps));
          return (
            <Sequence key={el.id} from={startFrame} durationInFrames={durFrames}>
              <ElementBridge
                element={el}
                fps={fps}
                durationMs={durMs}
                brandKit={effectiveBrandKit}
                variables={variables}
                animationRegistry={animationRegistry}
                rendererRegistry={rendererRegistry}
              />
            </Sequence>
          );
        })}

        {audioElements.map((el) => {
          const startFrame = msToFrame(el.startTime, fps);
          const durFrames = Math.max(1, msToFrame(el.duration, fps));
          return (
            <Sequence key={el.id} from={startFrame} durationInFrames={durFrames}>
              <Audio
                src={el.src}
                volume={el.volume ?? 1}
                loop={el.loop ?? false}
              />
            </Sequence>
          );
        })}
      </AbsoluteFill>
    </LocaleConfigContext.Provider>
  );
};

// ── ElementBridge ─────────────────────────────────────────────────────────────

interface ElementBridgeProps {
  element: Element;
  fps: number;
  durationMs: number;
  brandKit?: BrandKit;
  variables: Record<string, unknown>;
  animationRegistry: AnimationRegistry;
  rendererRegistry: ElementRendererRegistry;
}

/**
 * Tiny bridge component that lives inside a <Sequence>.
 *
 * By living inside the Sequence, useCurrentFrame() returns the frame RELATIVE
 * to the element's sequence start — so element renderers always receive frame=0
 * at their first visible frame, regardless of where they sit on the timeline.
 */
const ElementBridge: React.FC<ElementBridgeProps> = ({
  element,
  fps,
  durationMs,
  brandKit,
  variables,
  animationRegistry,
  rendererRegistry,
}) => {
  const frame = useCurrentFrame(); // relative to this element's Sequence
  const localeConfig = useContext(LocaleConfigContext);

  const renderer = rendererRegistry.get(element.type);
  if (!renderer) return null;

  return renderer({
    element,
    fps,
    frame,
    durationMs,
    brandKit,
    localeConfig,
    animationRegistry,
    variables,
  });
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function msToFrame(ms: number, fps: number): number {
  return Math.max(0, Math.round((ms / 1000) * fps));
}

function elementDurationMs(el: Element, fallback: number): number {
  if ('duration' in el && typeof (el as { duration?: number }).duration === 'number') {
    return (el as { duration: number }).duration;
  }
  return fallback;
}

function deriveDurationMs(elements: readonly Element[]): number {
  let max = 1000;
  for (const el of elements) {
    if (el.type === 'audio') {
      const end = el.startTime + el.duration;
      if (end > max) max = end;
    } else if ('duration' in el && typeof (el as any).duration === 'number') {
      if ((el as any).duration > max) max = (el as any).duration;
    }
  }
  return max;
}

export default ReelDocCanvas;
