/**
 * Locale config — the renderer half of the i18n orthogonal axis (Phase 0).
 *
 * The Modal side owns its locale knobs in workers/locale_pack.py (voice, cast,
 * tts language). The RENDERER's locale-varying knobs are caption typography and
 * line-breaking, so they live here as the single source instead of being
 * scattered as inline literals/regexes across the compositions.
 *
 * Contract (mirrors locale_pack / reel_mode): the axis is ADDITIVE — `ko`
 * reproduces today's CJK values VERBATIM, and `resolveLocaleConfig` defaults to
 * `ko`, so an untagged render is byte-identical. Adding a language later (e.g.
 * a Latin `line_break` for English in Phase 3, or `Noto Sans TC` for Chinese in
 * Phase 1) = adding one entry here, never touching the composition logic.
 */

/** Caption line-break strategy. 'cjk' = char-count chunking (today); 'latin' = Unicode word break (Phase 3). */
export type LineBreakStrategy = 'cjk' | 'latin';

/**
 * Caption emphasis style (B-CAPSTYLE). 'phrase-accent' = today's ko luxury look:
 * ONE colored power-word per line over the thick outline + 부수(non-key) words
 * recede with a subtle blur (NO karaoke). 'subtle-karaoke' = a restrained
 * left-to-right "spoken" highlight (en option): upcoming words sit at a dim floor
 * and lift to full opacity as playback crosses each word, with the current word
 * micro-bumping in scale. The power-word accent still rides on top.
 */
export type CaptionStyleStrategy = 'phrase-accent' | 'subtle-karaoke';

export interface LocaleConfig {
  /** Canonical short code (ko/en/zh-hant-tw/...). */
  code: string;
  /**
   * Caption/title font fallback chain appended AFTER the loaded display family.
   * Phase 1 swaps this per locale (e.g. Noto Sans TC/SC, Noto Sans JP).
   */
  captionFontFallback: string;
  /** Line-break strategy for caption chunking. */
  lineBreak: LineBreakStrategy;
  /** Target characters per caption line — CJK density is ~13 (one char ≈ one unit). */
  charsPerLine: number;
  /** Caption emphasis style — ko keeps the phrase-accent luxury look; en opts into restrained karaoke. */
  captionStyle: CaptionStyleStrategy;
}

/** ko = today's hardcoded CJK values, VERBATIM (byte-identical invariant). */
const KO: LocaleConfig = {
  code: 'ko',
  captionFontFallback: '"Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
  lineBreak: 'cjk',
  charsPerLine: 13,
  // Korean keeps the founder's phrase-accent look (one power-word, NO karaoke);
  // the Cloud Dancer luxury read depends on this restraint.
  captionStyle: 'phrase-accent',
};

/**
 * en = Latin captions. The bundled display family (Black Han Sans) carries NO
 * Latin glyphs, so English captions render in this bold Latin fallback chain —
 * visibly heavier/different letterforms from ko's Apple SD Gothic Neo. Latin
 * glyphs are far narrower than CJK, so a ~13-char line would waste the ~100px
 * caption band; ~26 fills the same visual width, producing genuinely different
 * line wrapping. The `latin` strategy never splits a word mid-glyph.
 */
const EN: LocaleConfig = {
  code: 'en',
  captionFontFallback: '"Archivo Black", "Arial Black", "Helvetica Neue", Arial, sans-serif',
  lineBreak: 'latin',
  charsPerLine: 26,
  // English short-form convention leans on a light word-sync read; opt into the
  // restrained karaoke fill (current word micro-emphasis), not full pop-per-word.
  captionStyle: 'subtle-karaoke',
};

/**
 * zh-Hant-TW = Traditional Chinese. CJK density matches ko (char-count chunking,
 * ~13/line), but the font fallback resolves to a Traditional-Chinese family so
 * shared/variant glyphs render in the TC forms rather than the KR family.
 */
const ZH_HANT_TW: LocaleConfig = {
  code: 'zh-hant-tw',
  captionFontFallback: '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Noto Sans CJK TC", sans-serif',
  lineBreak: 'cjk',
  charsPerLine: 13,
  // CJK shares ko's phrase-accent restraint (karaoke fill reads poorly on dense glyphs).
  captionStyle: 'phrase-accent',
};

/**
 * Registry keyed by the lowercased canonical code AND its common aliases, so
 * `resolveLocaleConfig('en-US')` / `'zh-Hant-TW'` / `'zh-TW'` all resolve.
 * Adding a language = adding an entry here; the composition logic never changes.
 */
export const LOCALE_CONFIGS: Record<string, LocaleConfig> = {
  ko: KO,
  en: EN,
  'en-us': EN,
  'en-gb': EN,
  zh: ZH_HANT_TW,
  'zh-hant': ZH_HANT_TW,
  'zh-hant-tw': ZH_HANT_TW,
  'zh-tw': ZH_HANT_TW,
};

/** The legacy/default config (used when a render carries no locale). */
export const DEFAULT_LOCALE_CONFIG: LocaleConfig = KO;

/** Resolve a render's LocaleConfig, defaulting to `ko` for absent/unknown locales. */
export function resolveLocaleConfig(locale?: string | null): LocaleConfig {
  const code = (locale || '').trim().toLowerCase();
  return LOCALE_CONFIGS[code] || KO;
}
