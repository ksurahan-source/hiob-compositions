/** Shared, clip-local audio envelope for browser preview and final rendering. */
export type VoiceWindow = { startMs: number; endMs: number };
type AudioClip = {
  trackKind: string;
  startMs: number;
  durationMs: number;
  inMs?: number;
  outMs?: number;
  url?: string | null;
  volume?: number;
  attributes?: Record<string, unknown>;
  effects?: { kind: string; disabled?: boolean; params?: Record<string, unknown> }[];
  keyframes?: { property: string; timeMs: number; value: number; easing?: string }[];
  wordTimings?: { startMs: number; endMs: number }[];
};
type AudioMix = { version?: number; voice?: number; music?: number; sfx?: number; autoDuck?: boolean; duck?: number; duckFadeMs?: number };
const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function sourceMuted(clip: AudioClip): boolean {
  const mode = clip.attributes?.source_audio_mode;
  return clip.attributes?.audio_muted === true
    || (['video', 'overlay'].includes(clip.trackKind) && (mode === 'mute' || mode === 'detached'));
}

function baseGain(clip: AudioClip, mix: AudioMix): number {
  if (sourceMuted(clip)) return 0;
  // Preserve the established contract: an explicit clip volume overrides its bus.
  const fallback = clip.trackKind === 'audio' ? finite(mix.voice, 1)
    : clip.trackKind === 'music' ? finite(mix.music, 0.15)
    : clip.trackKind === 'sfx' ? finite(mix.sfx, 0.6) : 1;
  if (mix.version === 2) return clamp01(finite(clip.volume, 1)) * clamp01(fallback);
  return clamp01(finite(clip.volume, fallback));
}

function automationGain(clip: AudioClip, localMs: number): number {
  const points = (clip.keyframes ?? [])
    .filter((key) => key.property === 'volume' && Number.isFinite(key.timeMs) && Number.isFinite(key.value))
    .sort((a, b) => a.timeMs - b.timeMs);
  if (!points.length) return 1;
  if (localMs <= points[0].timeMs) return clamp01(points[0].value);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (localMs <= b.timeMs) {
      const t = clamp01((localMs - a.timeMs) / Math.max(1, b.timeMs - a.timeMs));
      // Audio gain ramps intentionally interpolate linearly (no overshoot/clipping).
      return clamp01(a.value + (b.value - a.value) * t);
    }
  }
  return clamp01(points[points.length - 1].value);
}

export function audioVolumeAt(clip: AudioClip, mix: AudioMix = {}, localMs: number, windows: VoiceWindow[] = []): number {
  let gain = baseGain(clip, mix) * automationGain(clip, localMs);
  for (const effect of clip.effects ?? []) {
    if (effect.disabled) continue;
    const duration = Math.max(0, finite(effect.params?.durationMs, 300));
    if (!duration) continue;
    if (effect.kind === 'fade-in') gain *= clamp01(localMs / duration);
    if (effect.kind === 'fade-out') gain *= clamp01((clip.durationMs - localMs) / duration);
  }
  if (mix.autoDuck && clip.trackKind === 'music') {
    const now = clip.startMs + localMs;
    const fade = Math.max(0, finite(mix.duckFadeMs, 250));
    let weight = 0;
    for (const window of windows) {
      const value = fade === 0
        ? Number(now >= window.startMs && now < window.endMs)
        : Math.min(clamp01((now - window.startMs + fade) / fade), clamp01((window.endMs + fade - now) / fade));
      weight = Math.max(weight, value);
    }
    gain *= 1 - weight * clamp01(finite(mix.duck, 0.7));
  }
  return clamp01(gain);
}

/** Word timestamps are source-relative; trim/speed translate them onto the timeline. */
export function speechWindows(clips: AudioClip[], mix: AudioMix = {}): VoiceWindow[] {
  return clips.flatMap((clip) => {
    const role = clip.attributes?.audio_role;
    const speaks = clip.trackKind === 'audio' && role !== 'ambience' && role !== 'music' && role !== 'sfx'
      || clip.trackKind === 'video' && clip.attributes?.source_audio_mode === 'dialogue';
    if (!speaks || !clip.url || baseGain(clip, mix) === 0) return [];
    const speed = Math.max(0.25, Math.min(4, finite(clip.attributes?.speed, 1)));
    const trim = finite(clip.inMs, 0);
    const words = clip.wordTimings?.filter((word) => Number.isFinite(word.startMs) && Number.isFinite(word.endMs) && word.endMs > word.startMs);
    if (!words?.length) return [{ startMs: clip.startMs, endMs: clip.startMs + clip.durationMs }];
    return words.flatMap((word) => {
      const start = Math.max(0, (word.startMs - trim) / speed);
      const end = Math.min(clip.durationMs, ((clip.outMs == null ? word.endMs : Math.min(word.endMs, clip.outMs)) - trim) / speed);
      return end > start ? [{ startMs: clip.startMs + start, endMs: clip.startMs + end }] : [];
    });
  });
}
