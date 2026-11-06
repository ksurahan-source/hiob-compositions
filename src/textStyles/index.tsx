import React, { useEffect, useState } from 'react';
import { cancelRender, continueRender, delayRender } from 'remotion';
import { MOODS, type CaptionProps, type Mood, type Preset, type PresetMeta, type TitleProps } from './contract';
import { ensureFonts, type FontRequest } from './fonts';
import { preset as ledger } from './presets/ledger';
import { preset as statStamp } from './presets/stat-stamp';
import { preset as quoteCard } from './presets/quote-card';
import { preset as slamBar } from './presets/slam-bar';
import { preset as countdownPill } from './presets/countdown-pill';
import { preset as notificationPop } from './presets/notification-pop';
import { preset as softGlass } from './presets/soft-glass';
import { preset as letterboxStory } from './presets/letterbox-story';
import { preset as typewriterDiary } from './presets/typewriter-diary';
import { preset as bouncePop } from './presets/bounce-pop';
import { preset as glitchMeme } from './presets/glitch-meme';
import { preset as goldSerif } from './presets/gold-serif';
import { preset as spotlight } from './presets/spotlight';
import { preset as stepChip } from './presets/step-chip';
import { preset as chapterCard } from './presets/chapter-card';
import { preset as highlightMarker } from './presets/highlight-marker';

export type { CaptionProps, Mood, Preset, PresetMeta, TitleProps } from './contract';
export { MOODS } from './contract';

export interface TextStyle extends Preset {
  /** font families this style renders with (loaded before the first frame) */
  fonts: readonly FontRequest[];
}

const withFonts = (preset: Preset, fonts: readonly FontRequest[]): TextStyle => ({ ...preset, fonts });

/** Ordered by mood (trust → urgent → story → meme → luxury → info). */
export const TEXT_STYLES: readonly TextStyle[] = [
  withFonts(ledger, ['notoSansKR']),
  withFonts(statStamp, ['notoSansKR']),
  withFonts(quoteCard, ['gowunBatang@700', 'nanumMyeongjo@800', 'notoSansKR']),
  withFonts(slamBar, ['blackHanSans']),
  withFonts(countdownPill, ['notoSansKR']),
  withFonts(notificationPop, ['notoSansKR']),
  withFonts(softGlass, ['gowunBatang@700', 'gowunDodum']),
  withFonts(letterboxStory, ['notoSansKR']),
  withFonts(typewriterDiary, ['gowunBatang@700', 'nanumPenScript']),
  withFonts(bouncePop, ['jua']),
  withFonts(glitchMeme, ['doHyeon', 'notoSansKR']),
  withFonts(goldSerif, ['nanumMyeongjo@700', 'nanumMyeongjo@800']),
  withFonts(spotlight, ['gowunDodum', 'songMyung']),
  withFonts(stepChip, ['ibmPlexSansKR@700']),
  withFonts(chapterCard, ['ibmPlexSansKR', 'notoSansKR']),
  withFonts(highlightMarker, ['notoSansKR']),
];

const BY_ID = new Map(TEXT_STYLES.map((style) => [style.meta.id, style]));

export const TEXT_STYLE_IDS: readonly string[] = TEXT_STYLES.map((style) => style.meta.id);

/** Catalog for pickers and agents (metadata only, JSON-safe). */
export const TEXT_STYLE_CATALOG: readonly PresetMeta[] = TEXT_STYLES.map((style) => style.meta);

export function getTextStyle(id: unknown): TextStyle | undefined {
  return typeof id === 'string' ? BY_ID.get(id.trim()) : undefined;
}

export function textStylesForMood(mood: Mood): readonly TextStyle[] {
  return TEXT_STYLES.filter((style) => style.meta.mood === mood);
}

export function isMood(value: unknown): value is Mood {
  return typeof value === 'string' && (MOODS as readonly string[]).includes(value);
}

const FONT_LOAD_ATTEMPTS = 2;
/** Two attempts of FONT_ATTEMPT_TIMEOUT_MS each, plus margin. */
const FONT_GATE_TIMEOUT_MS = 120_000;

async function loadWithRetry(fonts: readonly FontRequest[]): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < FONT_LOAD_ATTEMPTS; attempt += 1) {
    try {
      await ensureFonts(fonts);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * Holds the frame until the style's fonts are ready. A font that still fails after a retry
 * cancels the render loudly instead of shipping fallback glyphs.
 */
export function FontGate({ fonts, children }: { fonts: readonly FontRequest[]; children: React.ReactNode }) {
  const [handle] = useState(() =>
    delayRender(`Loading text style fonts: ${fonts.join(', ')}`, { timeoutInMilliseconds: FONT_GATE_TIMEOUT_MS }),
  );
  useEffect(() => {
    let settled = false;
    loadWithRetry(fonts)
      .then(() => {
        settled = true;
        continueRender(handle);
      })
      .catch((error: unknown) => {
        settled = true;
        cancelRender(error);
      });
    // Release the hold if the clip unmounts before its fonts arrive.
    return () => {
      if (!settled) continueRender(handle);
    };
  }, [fonts, handle]);
  return <>{children}</>;
}

export function TextStyleTitle({ style, ...props }: TitleProps & { style: TextStyle }) {
  const { Title } = style;
  return (
    <FontGate fonts={style.fonts}>
      <Title {...props} />
    </FontGate>
  );
}

export function TextStyleCaption({ style, ...props }: CaptionProps & { style: TextStyle }) {
  const { Caption } = style;
  return (
    <FontGate fonts={style.fonts}>
      <Caption {...props} />
    </FontGate>
  );
}
