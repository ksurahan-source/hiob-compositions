export { TimelineCompositionV2 } from './TimelineCompositionV2';
export * from './types';

// ENG-04: Pure Interpreter
export { ReelDocCanvas, LocaleConfigContext } from './lib/ReelDocCanvas';
export type { ReelDocCanvasProps } from './lib/ReelDocCanvas';
export { defaultAnimationRegistry, AnimationRegistry } from './lib/animationRegistry';
export type { AnimationTransform, PresetAnimationFn } from './lib/animationRegistry';
export {
  defaultElementRendererRegistry,
  ElementRendererRegistry,
  evaluateKfProperty,
  applyAnimations,
} from './lib/elementRenderers';
export type { RendererProps, ElementRendererFn } from './lib/elementRenderers';
export { renderPropsToReelDoc } from './lib/TimelineCompositionV2Adapter';
export { resolveLocaleConfig, DEFAULT_LOCALE_CONFIG } from './localeConfig';
export type { LocaleConfig } from './localeConfig';
export {
  EXPECTED_REMOTION_VERSION,
  assertRemotionRuntimeVersion,
} from './remotionRuntime';

/** Shared aspect → dimensions map. Single source of truth. */
export const ASPECT_DIMENSIONS = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
} as const;

export const DEFAULT_FPS = 30;

// Text style pack: title/caption presets picked by mood/situation (attributes.text_style).
export {
  TEXT_STYLES,
  TEXT_STYLE_IDS,
  TEXT_STYLE_CATALOG,
  MOODS,
  getTextStyle,
  textStylesForMood,
  isMood,
  TextStyleTitle,
  TextStyleCaption,
} from './textStyles';
export type { TextStyle, Mood, PresetMeta as TextStyleMeta } from './textStyles';
