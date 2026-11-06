import type { FC } from 'react';

// Text style pack contract (title + caption presets picked by mood/situation).
// Users (studio) and AI agents (MCP) select a style by its stable `id` and stamp it on
// a title/caption clip as `attributes.text_style`.

/** Mood buckets users and agents filter by. */
export type Mood = 'trust' | 'urgent' | 'story' | 'meme' | 'luxury' | 'info';

export const MOODS: readonly Mood[] = ['trust', 'urgent', 'story', 'meme', 'luxury', 'info'];

export interface PresetMeta {
  /** kebab-case, stable — agents pass this string */
  id: string;
  /** name shown to users */
  nameKo: string;
  nameEn: string;
  mood: Mood;
  /** Korean situation tags, e.g. ['후기', '인증', '수치'] */
  situations: string[];
  /** one Korean sentence: when to use it */
  description: string;
  /** reference sources (ideas only, code is our own) */
  inspiredBy: string[];
}

export interface TitleProps {
  /** may contain '\n' */
  text: string;
  /** frames the title stays on screen (frame 0 = title start) */
  durationInFrames: number;
}

/** One caption cue. Lines reveal LINE BY LINE — never word-by-word karaoke (REC-0047). */
export interface CaptionProps {
  lines: string[];
  /** frame 0 = cue start */
  durationInFrames: number;
  /** optional key phrase inside one line; styled as a whole, never per spoken word */
  emphasis?: string;
}

export interface Preset {
  meta: PresetMeta;
  Title: FC<TitleProps>;
  Caption: FC<CaptionProps>;
}

// Presets are laid out for the 1080x1920 vertical canvas. Meta Reels safe zones:
// keep text out of the top 180px and below y=1248.
export const W = 1080;
export const H = 1920;

export const SAFE = {
  /** left/right gutter */
  x: 90,
  titleTop: 200,
  titleBottom: 560,
  captionTop: 880,
  captionBottom: 1240,
} as const;

/**
 * Hard guard for over-long copy: zones clip anything past the Meta-safe band while leaving
 * room for strokes, shadows and entrance overshoot (title y180..580, caption y860..1248).
 */
export const TITLE_ZONE_CLIP = 'inset(-20px -80px -20px -80px)';
export const CAPTION_ZONE_CLIP = 'inset(-20px -80px -8px -80px)';
