/**
 * Shared composition props. Both Studio (Player preview) and Renderer (Lambda)
 * import this to ensure preview and final output are pixel-identical.
 */

export type Track = 'script' | 'voiceover' | 'caption' | 'visual' | 'music' | 'sfx' | 'effect';

export interface BeatSlot {
  beatIndex: number;
  startMs: number;
  endMs: number;
  script?: string;
  voiceoverUrl?: string;
  visualUrl?: string;
  captionText?: string;
}

export interface FloatingClip {
  startMs: number;
  endMs: number;
  url?: string;
  text?: string;
}

export interface CompositionInputProps {
  /** Snapshot id used to build this composition (audit trail). */
  snapshotId?: string;
  /** Aspect ratio of output. */
  aspect?: '9:16' | '16:9' | '1:1';
  /** Beat-aligned tracks rolled up by beat. */
  beats: BeatSlot[];
  /** Single music track for the whole video. */
  musicUrl?: string;
  /** Free-positioned sfx + effect clips. */
  sfx?: FloatingClip[];
  effects?: FloatingClip[];
  /** Mix levels (0..1). */
  mix?: { voice?: number; music?: number; sfx?: number };
}
