/**
 * TimelineCompositionV2 — canonical composition shared by Studio preview + Lambda render.
 *
 * This is the SINGLE SOURCE OF TRUTH for reel rendering. It uses market-grade
 * caption + title styling (heavy Hangul display font, webkit-text-stroke, keyword
 * highlighting, orange accents) and drives:
 *   - <Player /> in Studio (browser, instant preview while editing)
 *   - Remotion Lambda (server, final MP4 render)
 *
 * Input shape comes from @hiob/timeline timelineToRenderProps(). This file
 * intentionally stays dumb — no DB access, no fetching. Pure props → pixels.
 */
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
// Animated GIFs need <Gif> to stay frame-synced with the Remotion timeline — a plain
// <Img> renders them frozen/erratic in the Lambda render (preview≠render breach).
import { Gif } from '@remotion/gif';
import type * as React from 'react';
import { createContext, useContext } from 'react';
import type { RenderProps, RenderClip, CaptionType } from '@hiob/timeline';
import { CAPTION_DEFAULTS, resolveCaptionLagMs, resolveCaptionHoldMs } from '@hiob/timeline';
// Cinematic-edit primitives (founder 2026-06-15 visual strategy), all deterministic.
import { FilmGrain } from './effects/filmGrain';
import { LightLeak } from './effects/lightLeak';
import { slidePanEntrance, pickDirection } from './effects/slidePan';
import { punchInTransform } from './effects/punchIn';
// visual_editor 2026-06-16 — per-beat cinematic accents (all deterministic, preview==render).
import { chromaticSplitFilter } from './effects/chromaticSplit';
import { speedRampStyle } from './effects/speedRamp';
import { LightSweep } from './effects/lightSweep';
import { EASING_FN } from './lib/easing';
// #5 typography: caption/title use a heavy display face (Black Han Sans),
// LOADED via @remotion/google-fonts so it is identical in the Studio <Player> preview
// AND the Lambda render (a bare system-font stack would resolve differently per
// environment and re-break the WYSIWYG unification).
import { loadFont as loadCaptionFont } from '@remotion/google-fonts/BlackHanSans';
// i18n Phase 0→1: caption typography + line-break knobs come from the locale
// config single source. The real locale now threads in via RenderProps.locale
// (sourced from run.brief.locale) → resolved once in the composition → carried
// to the deeply-nested caption/title renderers through LocaleConfigContext.
// Absent/unknown locale ⇒ DEFAULT_LOCALE_CONFIG (ko) ⇒ byte-identical render.
import { resolveLocaleConfig, DEFAULT_LOCALE_CONFIG, type LocaleConfig, type LineBreakStrategy } from './localeConfig';

const FALLBACK_BG = 'oklch(14% 0.01 240)';
const SUBBEAT_MAX_MS = 800; // EDIT-PACING: renderer advances to next sub-image every N ms
// The loaded heavy display family (Black Han Sans) is locale-invariant; only the
// fallback chain after it varies per locale (Phase 1 swaps Noto Sans TC/JP/...).
const DISPLAY_FONT_FAMILY = loadCaptionFont().fontFamily;
function captionFontFor(cfg: LocaleConfig): string {
  return `"${DISPLAY_FONT_FAMILY}", ${cfg.captionFontFallback}`;
}
// Module default = ko, so the static title/caption style consts below stay
// byte-identical; per-locale renders override fontFamily at the point of use.
const CAPTION_FONT = captionFontFor(DEFAULT_LOCALE_CONFIG);
// Resolved LocaleConfig flows from RenderProps.locale through this context so the
// caption + title renderers switch typography/line-break per locale without prop
// drilling. Default = ko ⇒ any node without a provider renders byte-identically.
const LocaleConfigContext = createContext<LocaleConfig>(DEFAULT_LOCALE_CONFIG);
type SceneType = 'hook' | 'narrator' | 'proof' | 'product' | 'cta';
type SceneLayer = 'background' | 'hero' | 'narrator' | 'caption' | 'audio';

const SCENE_TYPES: SceneType[] = ['hook', 'narrator', 'proof', 'product', 'cta'];
const FRAME_ZONE = {
  safeX: 90,
  titleTop: 118,
  safeContent: { x: 90, y: 130, width: 900, height: 1310 },
  // LOOP_UIUX TRACK B (founder 2026-06-04: 캡션을 "크게 통일"): the per-beat caption band is
  // BIG + width-filling + lower (off the face), bottom flush to the no-go line (1040+400=1440),
  // centred so the text never reaches the bottom-right action-rail corner.
  captionBand: { x: 50, y: 1040, width: 980, height: 400 },
  noGoBottomY: 1440,
  noGoRightX: 960,
};
// TMPL-6DO: Meta Reels 세이프존(1080×1920) 기반 六道 캡션 위치 프리셋.
// 세이프존: 상단 14%=270px 회피 · 하단 35%=y>1248px 회피 · 우측 15%=x>918px 회피.
// caption_position 미지정 클립은 기존 captionBand 유지 (byte-identical).
const META_SAFEZONE_BOTTOM = 1248; // 1920 * 0.65
const SIX_DO_CAPTION_POSITIONS: Record<string, { y: number; height: number }> = {
  'top':        { y: 310, height: 240 },  // 아수라/천상 — 개방·전진
  'mid-top':    { y: 560, height: 260 },  // 축생 — 보호·수축
  'mid':        { y: 780, height: 260 },  // 지옥/인간 — 긴장·도전
  'mid-bottom': { y: 970, height: 250 },  // 아귀 — 열망·하향 (max y+h=1220 < 1248 ✓)
};
const SCENE_TEMPLATES: Record<SceneType, { hero: 'full' | 'safe-card' | 'none'; narrator: 'full' | 'voiceover' | 'pip-left' | 'pip-right'; caption: 'hook' | 'band' }> = {
  hook: { hero: 'full', narrator: 'full', caption: 'hook' },
  narrator: { hero: 'none', narrator: 'full', caption: 'band' },
  proof: { hero: 'safe-card', narrator: 'voiceover', caption: 'band' },
  product: { hero: 'full', narrator: 'pip-right', caption: 'band' },
  cta: { hero: 'full', narrator: 'full', caption: 'band' },
};

function msToStartFrame(ms: number, fps: number): number {
  return Math.max(0, Math.round((ms / 1000) * fps));
}

function msToDurationFrames(ms: number, fps: number): number {
  return Math.max(1, Math.round((ms / 1000) * fps));
}

// Napkin I2: the base image lane is a HARD CUT throughout — ZERO fade-to-black,
// including at the reel's first and last frames. A fade-from/to-black at the
// edges would put luma<16 frames at the start/end and fail the black-scan gate,
// and a per-clip fade at internal cuts dipped through the dark FALLBACK_BG (the
// original inter-scene 0.1s blackout). Intentional fades, when wanted, come from
// explicit 'fade-in'/'fade-out' clip effects (see transformEffects), not here.

function clipHash(id = ''): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash;
}

function kenBurnsTransform(frame: number, durationInFrames: number, clipId: string): { scale: number; x: number; y: number } {
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const hash = clipHash(clipId);
  const direction = hash % 4;
  const pan = interpolate(progress, [0, 1], [-1.8, 1.8], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // 2026-07-09 founder "전 컷이 동일하게 뾱 들어간다": 줌이 항상 1.0→1.07 push-in 단일이라
  // 팬 축만 달라도 리듬이 죽는다. subshotKenBurns처럼 해시로 스타일 교대 —
  // 0=줌인, 1=줌아웃, 2=홀드(고정 1.04 + 팬 드리프트만). 순수 프레임 수학 ⇒ preview==render.
  const style = (hash >> 2) % 3;
  const scale = style === 0
    ? interpolate(progress, [0, 1], [1.0, 1.06], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : style === 1
      ? interpolate(progress, [0, 1], [1.06, 1.0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
      : 1.04;
  return {
    scale,
    x: direction === 0 ? pan : direction === 1 ? -pan : 0,
    y: direction === 2 ? pan : direction === 3 ? -pan : 0,
  };
}

// B-SHOT3: gentle drift for B-SHOT2 sub-shots. A sub-shot is a STATIC reframe
// (transforms.scale != 1) of a held beat image, so the normal ken-burns is off
// (hasManualFraming). Without motion each ~2.75s reframe is a frozen crop. This
// adds a subtle ADDITIVE breath ON TOP of the base reframe: a slow ~3.5% zoom
// (in or out, alternating by key so consecutive sub-shots don't all push the same
// way) plus a ≤0.8% pan. Returned scale MULTIPLIES the base reframe scale and the
// x/y ADD to the base framing offset (same contract as kenBurnsTransform). Pure
// frame math ⇒ deterministic, preview==render. Gentler than kenBurnsTransform
// (1.07 + 1.8% pan) because the image is already cropped/zoomed by the reframe.
function subshotKenBurns(frame: number, durationInFrames: number, key: string): { scale: number; x: number; y: number } {
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const hash = clipHash(key);
  const direction = hash % 4;
  const pan = interpolate(progress, [0, 1], [-0.8, 0.8], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const zoomIn = (hash >> 2) % 2 === 0;
  const scale = zoomIn
    ? interpolate(progress, [0, 1], [1.0, 1.035], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : interpolate(progress, [0, 1], [1.035, 1.0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return {
    scale,
    x: direction === 0 ? pan : direction === 1 ? -pan : 0,
    y: direction === 2 ? pan : direction === 3 ? -pan : 0,
  };
}

function effectByKind(clip: RenderClip, kind: string) {
  return (clip.effects ?? []).find((effect) => effect.kind === kind);
}

function clipAttributes(clip: RenderClip): Record<string, unknown> {
  return (clip.attributes ?? {}) as Record<string, unknown>;
}

function normalizeSceneType(value: unknown): SceneType | null {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return SCENE_TYPES.includes(raw as SceneType) ? (raw as SceneType) : null;
}

function resolveSceneType(clip: RenderClip): SceneType {
  const attrs = clipAttributes(clip);
  const explicit = normalizeSceneType(attrs.scene_type ?? attrs.sceneType);
  if (explicit) return explicit;
  if (effectByKind(clip, 'proof-frame')) return 'proof';
  const labelText = `${attrs.scene_role ?? ''} ${attrs.logic_function ?? ''}`.toLowerCase();
  if (/사회적\s*증거|증거|후기|리뷰|proof|social|review|testimonial/.test(labelText)) return 'proof';
  if (/제품|상품|서비스|데모|시연|사용|product|demo/.test(labelText)) return 'product';
  if (/cta|call.to.action|구매|주문|신청|문의|상담|전환/.test(labelText)) return 'cta';
  if (clip.beatIndex === 0) return 'hook';
  return 'narrator';
}

function resolveSceneLayer(clip: RenderClip, scene_type: SceneType): SceneLayer {
  const explicit = String(clipAttributes(clip).scene_layer ?? '').trim().toLowerCase();
  if (explicit === 'background' || explicit === 'hero' || explicit === 'narrator' || explicit === 'caption' || explicit === 'audio') {
    return explicit;
  }
  if (clip.assetKind === 'audio') return 'audio';
  if (clip.trackKind === 'audio' || clip.trackKind === 'music' || clip.trackKind === 'sfx') return 'audio';
  if (clip.assetKind === 'image' || clip.assetKind === 'video') {
    if (effectByKind(clip, 'proof-frame')) return 'hero';
    if (scene_type === 'hook') return 'hero';
    return 'narrator';
  }
  if (clip.trackKind === 'caption' || clip.trackKind === 'overlay' || clip.trackKind === 'title') return 'caption';
  if (effectByKind(clip, 'proof-frame')) return 'hero';
  if (scene_type === 'hook') return 'hero';
  return 'narrator';
}

type SceneWindow = { startMs: number; endMs: number; scene_type: SceneType };

function clipWindow(clip: RenderClip): SceneWindow {
  return { startMs: clip.startMs, endMs: clip.startMs + clip.durationMs, scene_type: resolveSceneType(clip) };
}

function isInsideWindow(ms: number, windows: SceneWindow[]): boolean {
  return windows.some((w) => ms >= w.startMs && ms < w.endMs);
}

function overlapsWindow(clip: RenderClip, windows: SceneWindow[]): boolean {
  const start = clip.startMs;
  const end = clip.startMs + clip.durationMs;
  return windows.some((w) => start < w.endMs && end > w.startMs);
}

function effectByKinds(clip: RenderClip, kinds: string[]) {
  return (clip.effects ?? []).find((effect) => kinds.includes(effect.kind));
}

function paramNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function paramString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function appendFilter(style: React.CSSProperties, filter: string) {
  style.filter = style.filter ? `${String(style.filter)} ${filter}` : filter;
}

// G2 FILTERS — color/look presets expressed as a pure CSS filter string. CSS filters
// resolve identically in the Studio <Player> and the Lambda render, so a filtered clip
// is byte-faithful preview==render. Clips with no `filter` effect are untouched.
function lookFilter(preset: string): string {
  switch (preset) {
    case 'warm': return 'saturate(1.28) sepia(0.22) brightness(1.04) contrast(1.05)';
    case 'cool': return 'saturate(1.12) hue-rotate(-14deg) brightness(1.02) contrast(1.06)';
    case 'film': return 'contrast(1.18) saturate(0.9) sepia(0.12) brightness(0.98)';
    case 'bw': return 'grayscale(1) contrast(1.12) brightness(1.03)';
    case 'noir': return 'grayscale(1) contrast(1.38) brightness(0.9)';
    case 'vivid': return 'saturate(1.55) contrast(1.12) brightness(1.02)';
    case 'fade': return 'contrast(0.84) saturate(0.8) brightness(1.09)';
    case 'vintage': return 'sepia(0.44) saturate(1.12) contrast(1.06) brightness(1.02)';
    case 'dreamy': return 'saturate(1.18) brightness(1.08) contrast(0.94)';
    default: return 'saturate(1.1)';
  }
}

// CapCut chroma key (green-screen removal) — a real SVG feColorMatrix keyer: it measures
// "green-ness" (a = -R + G - B), sharpens that into an alpha mask, then composites the source
// OUT of the mask so green pixels drop to transparent. `similarity` widens what counts as key.
// Targets the green key (CapCut default); rendered once per keyed clip via an inline <defs>,
// referenced by `filter: url(#id)`. Absent ⇒ no filter ⇒ byte-identical.
const ChromaKeyDefs: React.FC<{ id: string; similarity: number }> = ({ id, similarity }) => {
  const s = Math.max(0, Math.min(1, similarity));
  const slope = 4 + s * 16;
  const intercept = -(0.1 + s * 0.4);
  return (
    <svg aria-hidden style={{ position: 'absolute', width: 0, height: 0 }}>
      <defs>
        <filter id={id} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -1 1 -1 0 0" result="green" />
          <feComponentTransfer in="green" result="mask">
            <feFuncA type="linear" slope={slope} intercept={intercept} />
          </feComponentTransfer>
          <feComposite in="SourceGraphic" in2="mask" operator="out" />
        </filter>
      </defs>
    </svg>
  );
};

// CapCut shape mask → CSS clip-path (byte-faithful preview==render). size = % of the frame
// the shape spans; x/y = shape center in %. Absent 'mask' effect ⇒ no clipPath ⇒ untouched.
function maskClipPath(shape: string, size: number, x: number, y: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const r = clamp(size) / 2;
  const cx = clamp(x);
  const cy = clamp(y);
  switch (shape) {
    case 'circle': return `circle(${r}% at ${cx}% ${cy}%)`;
    case 'ellipse': return `ellipse(${(r * 0.72).toFixed(1)}% ${r}% at ${cx}% ${cy}%)`;
    case 'rect': return `inset(${clamp(cy - r)}% ${clamp(100 - (cx + r))}% ${clamp(100 - (cy + r))}% ${clamp(cx - r)}%)`;
    case 'rounded': return `inset(${clamp(cy - r)}% ${clamp(100 - (cx + r))}% ${clamp(100 - (cy + r))}% ${clamp(cx - r)}% round 12%)`;
    default: return '';
  }
}

function transformEffects(clip: RenderClip, frame: number, fps: number, durationInFrames: number) {
  let opacity = 1;
  let filter = '';
  let transform = '';
  let clipPath = '';
  let blendMode = '';
  const tMs = (frame / fps) * 1000;

  for (const eff of clip.effects ?? []) {
    // CapCut effect enable/disable — a disabled effect is skipped entirely (byte-identical
    // to not having it), so the editor can toggle an effect off without deleting it.
    if ((eff as { disabled?: boolean }).disabled === true) continue;
    if (eff.kind === 'fade-in') {
      const dMs = paramNumber(eff.params?.durationMs, 300);
      opacity *= dMs > 0 ? Math.min(1, tMs / dMs) : 1;
    } else if (eff.kind === 'fade-out') {
      const dMs = paramNumber(eff.params?.durationMs, 300);
      if (dMs > 0 && tMs > clip.durationMs - dMs) {
        opacity *= Math.max(0, (clip.durationMs - tMs) / dMs);
      }
    } else if (eff.kind === 'blur') {
      filter += `${filter ? ' ' : ''}blur(${paramNumber(eff.params?.radiusPx, 6)}px)`;
    } else if (eff.kind === 'glow') {
      const color = paramString(eff.params?.color, 'rgba(255, 209, 102, 0.72)');
      // E1 bug 1: accept radiusPx (what the inspector now sends) OR a legacy
      // 0..1 `intensity`, and CLAMP to a safe range. An unclamped/garbage radius
      // ballooned the drop-shadow filter and blew the layer off-canvas (blank clip).
      const rawRadius = eff.params?.radiusPx != null
        ? paramNumber(eff.params?.radiusPx, 16)
        : paramNumber(eff.params?.intensity, 0.55) * 28;
      const radius = Math.max(0, Math.min(64, rawRadius));
      filter += `${filter ? ' ' : ''}drop-shadow(0 0 ${radius}px ${color})`;
    } else if (eff.kind === 'shake') {
      const amplitude = paramNumber(eff.params?.amplitudePx, 8);
      const speed = paramNumber(eff.params?.speed, 1.7);
      const x = Math.sin(frame * speed) * amplitude;
      const y = Math.cos(frame * speed * 1.31) * amplitude * 0.42;
      transform += ` translate(${x}px, ${y}px)`;
    } else if (eff.kind === 'ken-burns') {
      const from = paramNumber(eff.params?.from, 1.0);
      const to = paramNumber(eff.params?.to, 1.15);
      const progress = Math.min(1, Math.max(0, tMs / Math.max(1, clip.durationMs)));
      transform += ` scale(${from + (to - from) * progress})`;
    } else if (eff.kind === 'zoom-in' || eff.kind === 'zoom-out') {
      const amount = paramNumber(eff.params?.amount, 0.12);
      const progress = Math.min(1, Math.max(0, frame / Math.max(1, durationInFrames)));
      const scale = eff.kind === 'zoom-in' ? 1 + amount * progress : 1 + amount * (1 - progress);
      transform += ` scale(${scale})`;
    } else if (eff.kind === 'transition') {
      // G1 TRANSITIONS — an entrance ('in') or exit ('out') animation over durationMs at a
      // cut. type: fade | crossfade | wipe | slide-l/r/u/d | zoom. p: 0 (extreme) → 1 (full).
      const type = paramString(eff.params?.type, 'fade');
      const dMs = paramNumber(eff.params?.durationMs, 500);
      const dir = paramString(eff.params?.dir, 'in');
      let p = 1;
      if (dir === 'out') {
        p = dMs > 0 && tMs > clip.durationMs - dMs ? Math.max(0, Math.min(1, (clip.durationMs - tMs) / dMs)) : 1;
      } else {
        p = dMs > 0 ? Math.max(0, Math.min(1, tMs / dMs)) : 1;
      }
      if (type === 'fade' || type === 'crossfade') opacity *= p;
      else if (type === 'wipe') clipPath = `inset(0 ${(1 - p) * 100}% 0 0)`;
      else if (type === 'slide-l') transform += ` translateX(${(p - 1) * 100}%)`;
      else if (type === 'slide-r') transform += ` translateX(${(1 - p) * 100}%)`;
      else if (type === 'slide-u') transform += ` translateY(${(1 - p) * 100}%)`;
      else if (type === 'slide-d') transform += ` translateY(${(p - 1) * 100}%)`;
      else if (type === 'zoom') { transform += ` scale(${0.6 + 0.4 * p})`; opacity *= p; }
    } else if (eff.kind === 'filter') {
      // G2 FILTERS — color/look LUT-style preset.
      filter += `${filter ? ' ' : ''}${lookFilter(paramString(eff.params?.preset, 'warm'))}`;
    } else if (eff.kind === 'adjust') {
      // G3 ADJUSTMENT — per-clip color grade. brightness/contrast/saturation: 1 = neutral.
      // temperature: -100 (cool) .. +100 (warm), approximated with sepia / hue-rotate.
      const b = Math.max(0, Math.min(3, paramNumber(eff.params?.brightness, 1)));
      const c = Math.max(0, Math.min(3, paramNumber(eff.params?.contrast, 1)));
      const s = Math.max(0, Math.min(3, paramNumber(eff.params?.saturation, 1)));
      const temp = Math.max(-100, Math.min(100, paramNumber(eff.params?.temperature, 0)));
      filter += `${filter ? ' ' : ''}brightness(${b}) contrast(${c}) saturate(${s})`;
      if (temp > 0) filter += ` sepia(${(temp / 100) * 0.5})`;
      else if (temp < 0) filter += ` hue-rotate(${(temp / 100) * 18}deg)`;
    } else if (eff.kind === 'chromatic-split') {
      // RGB-split fringe (chromatic aberration) — a pure CSS filter fragment, so it
      // composes with the look/adjust filters above and stays preview==render.
      filter += `${filter ? ' ' : ''}${chromaticSplitFilter(frame, {
        intensity: paramNumber(eff.params?.intensity, 4),
        alpha: paramNumber(eff.params?.alpha, 0.6),
        pulse: eff.params?.pulse === true || eff.params?.pulse === 'true',
        axis: paramString(eff.params?.axis, 'x'),
      })}`;
    } else if (eff.kind === 'speed-ramp') {
      // Editorial whip: a brief directional translate + scale punch + motion-blur spike.
      // MOTION speed-ramp (camera whip), not source time-remapping — see speedRamp.tsx.
      const ramp = speedRampStyle(frame, durationInFrames, {
        at: paramNumber(eff.params?.at, 0.68),
        frames: paramNumber(eff.params?.frames, 6),
        intensity: paramNumber(eff.params?.intensity, 8),
        blur: paramNumber(eff.params?.blur, 16),
        zoom: paramNumber(eff.params?.zoom, 1.06),
        direction: paramString(eff.params?.direction, 'left'),
      });
      transform += ramp.transform;
      if (ramp.filter) filter += `${filter ? ' ' : ''}${ramp.filter}`;
    } else if (eff.kind === 'opacity') {
      // CapCut per-clip opacity — multiplies the clip's alpha (1 = opaque, 0 = invisible).
      // Composes with fades; overlay clips dial this down to blend over the layer beneath.
      opacity *= Math.max(0, Math.min(1, paramNumber(eff.params?.value, 1)));
    } else if (eff.kind === 'blend') {
      // CapCut blend mode — how this clip composites over clips beneath it in z-order.
      blendMode = paramString(eff.params?.mode, 'normal');
    } else if (eff.kind === 'mask') {
      // CapCut shape mask — reveal only a shape of the clip (circle/ellipse/rect/rounded).
      clipPath = maskClipPath(
        paramString(eff.params?.shape, 'circle'),
        paramNumber(eff.params?.size, 70),
        paramNumber(eff.params?.x, 50),
        paramNumber(eff.params?.y, 50),
      ) || clipPath;
    }
  }

  return { opacity, filter, transform, clipPath, blendMode };
}

// Per-clip visual overlays. `frame` is the clip-local frame so animated
// effects (glitch flicker, light-leak drift, vhs roll, particle float) stay
// deterministic and reproducible under Remotion render.
function effectOverlays(clip: RenderClip, frame: number, durationInFrames: number): React.ReactNode {
  const overlays: React.ReactNode[] = [];
  const grain = effectByKind(clip, 'grain');
  if (grain) {
    overlays.push(
      <AbsoluteFill
        key="grain"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.18) 0 1px, transparent 1px), radial-gradient(circle at 80% 70%, rgba(0,0,0,0.2) 0 1px, transparent 1px)',
          backgroundSize: '5px 5px, 7px 7px',
          opacity: paramNumber(grain.params?.opacity, 0.12),
          mixBlendMode: 'overlay',
          pointerEvents: 'none',
        }}
      />,
    );
  }

  const vignette = effectByKind(clip, 'vignette');
  if (vignette) {
    overlays.push(
      <AbsoluteFill
        key="vignette"
        style={{
          background: 'radial-gradient(circle at center, transparent 42%, rgba(0,0,0,0.48) 100%)',
          opacity: paramNumber(vignette.params?.opacity, 0.55),
          pointerEvents: 'none',
        }}
      />,
    );
  }

  const glitch = effectByKind(clip, 'glitch');
  if (glitch) {
    const intensity = Math.max(0, Math.min(1, paramNumber(glitch.params?.intensity, 0.5)));
    const onFrames = Math.max(1, Math.round(2 + intensity * 4));
    if (frame % 14 < onFrames) {
      const shift = ((clipHash(`${clip.id}${frame}`) % 7) - 3) * (1 + intensity * 2);
      overlays.push(
        <AbsoluteFill key="glitch" style={{ pointerEvents: 'none', mixBlendMode: 'screen' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: `${clipHash(`${clip.id}a${frame}`) % 78}%`, height: `${4 + intensity * 6}%`, background: 'rgba(0,229,255,0.45)', transform: `translateX(${shift}%)`, mixBlendMode: 'screen' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: `${clipHash(`${clip.id}b${frame}`) % 78}%`, height: `${3 + intensity * 5}%`, background: 'rgba(255,0,128,0.45)', transform: `translateX(${-shift}%)`, mixBlendMode: 'screen' }} />
        </AbsoluteFill>,
      );
    }
  }

  const lightLeak = effectByKind(clip, 'light-leak');
  if (lightLeak) {
    const intensity = Math.max(0, Math.min(1, paramNumber(lightLeak.params?.intensity, 0.55)));
    const driftX = 65 + Math.sin(frame * 0.05) * 22;
    const pulse = 0.45 + 0.25 * Math.sin(frame * 0.08);
    overlays.push(
      <AbsoluteFill
        key="light-leak"
        style={{
          background: `radial-gradient(120% 90% at ${driftX}% 12%, rgba(255,184,92,${0.55 * intensity}) 0%, rgba(255,120,60,${0.22 * intensity}) 30%, transparent 60%)`,
          mixBlendMode: 'screen',
          opacity: Math.max(0, Math.min(1, pulse + intensity * 0.2)),
          pointerEvents: 'none',
        }}
      />,
    );
  }

  const vhs = effectByKind(clip, 'vhs-scanline');
  if (vhs) {
    const intensity = Math.max(0, Math.min(1, paramNumber(vhs.params?.intensity, 0.5)));
    const roll = (frame * 1.6) % 100;
    overlays.push(
      <AbsoluteFill key="vhs" style={{ pointerEvents: 'none' }}>
        <AbsoluteFill
          style={{
            backgroundImage: 'repeating-linear-gradient(to bottom, rgba(0,0,0,0.22) 0px, rgba(0,0,0,0.22) 1px, transparent 1px, transparent 3px)',
            mixBlendMode: 'multiply',
            opacity: 0.35 + 0.45 * intensity,
          }}
        />
        <div style={{ position: 'absolute', left: 0, right: 0, top: `${roll}%`, height: '9%', background: 'linear-gradient(rgba(255,255,255,0.04), rgba(255,255,255,0.16), rgba(255,255,255,0.02))', mixBlendMode: 'screen' }} />
      </AbsoluteFill>,
    );
  }

  const particle = effectByKind(clip, 'particle');
  if (particle) {
    const count = Math.max(4, Math.min(40, Math.round(paramNumber(particle.params?.count, 18))));
    const color = paramString(particle.params?.color, 'rgba(255,225,150,0.92)');
    overlays.push(
      <AbsoluteFill key="particle" style={{ pointerEvents: 'none', mixBlendMode: 'screen' }}>
        {Array.from({ length: count }).map((_, i) => {
          const seed = clipHash(`${clip.id}p${i}`);
          const speed = 0.18 + (seed % 7) / 12;
          const yy = 105 - (((frame * speed) + (seed % 110)) % 125);
          const sway = Math.sin(frame * 0.045 + (seed % 6)) * 2.4;
          const size = 2 + (seed % 4);
          return (
            <span
              key={i}
              style={{
                position: 'absolute',
                left: `${(seed % 100) + sway}%`,
                top: `${yy}%`,
                width: size,
                height: size,
                borderRadius: '50%',
                background: color,
                opacity: 0.45 + (seed % 5) / 10,
                filter: 'blur(0.4px)',
              }}
            />
          );
        })}
      </AbsoluteFill>,
    );
  }

  const sweep = effectByKind(clip, 'light-sweep');
  if (sweep) {
    overlays.push(
      <LightSweep
        key="light-sweep"
        frame={frame}
        durationInFrames={durationInFrames}
        at={paramNumber(sweep.params?.at, 0.12)}
        frames={paramNumber(sweep.params?.frames, 18)}
        angle={paramNumber(sweep.params?.angle, 18)}
        color={paramString(sweep.params?.color, 'rgba(255,255,255,0.85)')}
        width={paramNumber(sweep.params?.width, 26)}
        opacity={paramNumber(sweep.params?.opacity, 0.6)}
        loop={sweep.params?.loop === true || sweep.params?.loop === 'true'}
      />,
    );
  }

  return overlays.length ? <>{overlays}</> : null;
}

function resolveAudioVolume(clip: RenderClip, mix?: RenderProps['mix']): number {
  if (clip.volume != null) return clip.volume;
  if (clip.trackKind === 'audio') return mix?.voice ?? 1;
  if (clip.trackKind === 'music') return mix?.music ?? 0.15;
  if (clip.trackKind === 'sfx') return mix?.sfx ?? 0.6;
  return 1;
}

// Easing curves now live in ./lib/easing (shared with the ReelDoc element path)
// so a keyframe's `easing` name renders identically in preview, Lambda, and the
// ReelDoc interpreter. The original 6 are kept byte-compatible there; motion
// templates add back/overshoot/expo/quint/sine for the "손맛" feel.

function applyKf(clip: RenderClip, prop: 'opacity' | 'scale' | 'x' | 'y' | 'rotation', fallback: number, localFrame: number, fps: number): number {
  const kfs = (clip.keyframes ?? []).filter((k) => k.property === prop);
  if (kfs.length === 0) return fallback;
  const sorted = [...kfs].sort((a, b) => a.timeMs - b.timeMs);
  const tMs = (localFrame / fps) * 1000;
  if (tMs <= sorted[0].timeMs) return sorted[0].value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (tMs >= a.timeMs && tMs <= b.timeMs) {
      const easing = EASING_FN[a.easing as string] ?? EASING_FN.linear;
      return interpolate(tMs, [a.timeMs, b.timeMs], [a.value, b.value], { easing });
    }
  }
  return sorted[sorted.length - 1].value;
}

function chunkLongCaption(
  text: string,
  maxLines: number,
  charsPerLine: number = DEFAULT_LOCALE_CONFIG.charsPerLine,
  lineBreak: LineBreakStrategy = DEFAULT_LOCALE_CONFIG.lineBreak,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const targetLines = Math.min(maxLines, Math.max(2, Math.ceil(text.length / charsPerLine)));
  if (words.length <= 1) {
    // Latin: a single token is one whole word — never slice it mid-glyph (that
    // would produce garbled fragments like "exper" / "ience"). CJK chars are
    // independent units, so the char-count chunk is correct there (ko verbatim).
    if (lineBreak === 'latin') return [text.trim()].filter(Boolean);
    const chunkSize = Math.ceil(text.length / targetLines);
    return Array.from({ length: targetLines })
      .map((_, i) => text.slice(i * chunkSize, (i + 1) * chunkSize).trim())
      .filter(Boolean);
  }

  const targetLength = Math.ceil(text.length / targetLines);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > targetLength && lines.length < targetLines - 1) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function mergeCaptionLines(lines: string[], maxLines: number): string[] {
  const clean = lines.map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (clean.length <= maxLines) return clean;
  return [...clean.slice(0, maxLines - 1), clean.slice(maxLines - 1).join(' ')];
}

function captionLineGroups(
  text: string | undefined,
  maxLines = 3,
  charsPerLine: number = DEFAULT_LOCALE_CONFIG.charsPerLine,
  lineBreak: LineBreakStrategy = DEFAULT_LOCALE_CONFIG.lineBreak,
): string[] {
  const clean = (text ?? '').replace(/\r/g, '').trim();
  if (!clean) return [];
  const explicitLines = clean.split(/\n+/).filter((line) => line.trim());
  if (explicitLines.length > 1) return mergeCaptionLines(explicitLines, maxLines);
  const sentenceLines = clean.split(/(?<=[.!?])\s+|[|/]+|,\s+/).filter((line) => line.trim());
  if (sentenceLines.length > 1) return mergeCaptionLines(sentenceLines, maxLines);
  // Single-line short-circuit: CJK keeps the legacy 16-char threshold (ko byte-identical);
  // Latin fills the wider per-line budget (narrower glyphs) before it needs to wrap.
  const singleLineMax = lineBreak === 'latin' ? charsPerLine : 16;
  if (clean.length <= singleLineMax) return [clean];
  return mergeCaptionLines(chunkLongCaption(clean.replace(/\s+/g, ' '), maxLines, charsPerLine, lineBreak), maxLines);
}

// ─── Market-grade caption emphasis (selective, NOT auto-karaoke) ─────────────
// ONE highlighter marker on the single key word per line; a Korean-aware keyword
// lexicon picks it, with a longest-word fallback on the punch (last) line so the
// payoff line always carries emphasis.
// archiveknock "포인트 컬러 하나" — the single brand point color for keyword emphasis.
// Default = HIOB logo orange; per-brand override rides in via clip.attributes.brand_point_color
// (Modal stamps it from the brand theme), so each brand gets its own consistent accent.
const CAPTION_ACCENT = '#df5a2d';
// 주황 강조 비활성 (founder 2026-07-12 "강조 단어 주황색 너무 그런것 같아·일단 빼줘"):
// false면 강조어도 주황/컬러 없이 일반 흰색 — 키워드는 미세 스케일 팝만 남긴다(컬러 아님).
// 나중 되살리려면 true. (metric green도 함께 꺼진다 — 컬러 강조 전면 오프.)
const CAPTION_ACCENT_ENABLED = false;
// 자막 블러 제거 (founder 2026-07-12 "강조 빼고 전부 30% 블러 같은데 블러는 풀어줘"):
// 비강조어를 흐리게 하던 focus-pull(VERIFY-C3)을 끈다 — 모든 글자가 또렷하게. 0=전면 오프.
const SECONDARY_CAPTION_BLUR_PX = 0;
const CAPTION_KEYWORD_RE = /[0-9%]|히옵|매출|손님|단골|문의|예약|장부|조회수|폭발|대박|무료|공짜|지금|줄|끊|망|됐|늘|채워|살리|답|릴스|광고|전환|성공|후기|첫|딱/;
function captionKeywordIndex(words: string[], isLastLine: boolean): number {
  for (let i = 0; i < words.length; i += 1) {
    if (CAPTION_KEYWORD_RE.test(words[i])) return i;
  }
  if (isLastLine && words.length > 0) {
    const len = (w: string) => w.replace(/[^가-힣a-zA-Z0-9]/g, '').length;
    let best = 0;
    for (let i = 1; i < words.length; i += 1) if (len(words[i]) > len(words[best])) best = i;
    return best;
  }
  return -1;
}

// ─── B-CAPSTYLE: restrained per-word karaoke (en option; ko stays phrase-accent) ──
// A subtle left-to-right "spoken" highlight: upcoming words sit at a dim floor and
// lift to full opacity as playback crosses each word's window; the current word
// micro-bumps in scale and settles back. Deterministic (frame-based) → preview==render
// and Modal-0. Word windows come from clip.wordTimings (ElevenLabs, free) when present,
// else an even split across the clip — so it works on any caption. NEVER runs for the
// phrase-accent locales (ko/zh), which keep today's look byte-identical.
const KARAOKE_DIM_OPACITY = 0.74; // upcoming words recede but stay muted-readable (VISUAL_STRATEGY §1)
const KARAOKE_PEAK_SCALE = 1.055; // restrained micro-bump on the word being spoken
const KARAOKE_OPACITY_RAMP_FRAMES = 3; // short lift so the fill reads as motion, not a hard step
function karaokeWordState(
  globalIndex: number,
  totalWords: number,
  frame: number,
  durationInFrames: number,
  windowFrames: { startF: number; endF: number } | null,
): { scale: number; opacity: number } {
  let startF: number;
  let endF: number;
  if (windowFrames) {
    startF = windowFrames.startF;
    endF = windowFrames.endF;
  } else {
    const slot = durationInFrames / Math.max(totalWords, 1);
    startF = globalIndex * slot;
    endF = (globalIndex + 1) * slot;
  }
  // Guard degenerate/zero-length windows (e.g. startMs===endMs from upstream) so the
  // interpolate input stays strictly monotonic and never throws.
  const safeEnd = Math.max(endF, startF + 1);
  const opacity = interpolate(frame, [startF - KARAOKE_OPACITY_RAMP_FRAMES, startF], [KARAOKE_DIM_OPACITY, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const mid = startF + (safeEnd - startF) * 0.4;
  const scale = interpolate(frame, [startF, mid, safeEnd], [1, KARAOKE_PEAK_SCALE, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return { scale, opacity };
}

// EDIT-2.2: per-type caption entrance animation (pop/fade-in/slide-in/bounce).
// Returns extra CSS to merge into the caption container. When progress===1 (fully
// appeared) all values resolve to identity so older clips are byte-identical.
function applyTypeEntranceAnimation(
  effect: string,
  progress: number,
): { opacity: number; transform: string } {
  const p = Math.max(0, Math.min(1, progress));
  if (p >= 1) return { opacity: 1, transform: '' };
  switch (effect) {
    case 'pop': {
      const scale = interpolate(p, [0, 1], [0.72, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      return { opacity: p < 0.15 ? 0 : 1, transform: `scale(${scale.toFixed(4)})` };
    }
    case 'slide-in': {
      const tx = interpolate(p, [0, 1], [-110, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      return { opacity: Math.min(1, p * 3), transform: `translateX(${tx.toFixed(2)}px)` };
    }
    case 'bounce': {
      const scale = p < 0.6
        ? interpolate(p, [0, 0.6], [0.5, 1.12], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        : interpolate(p, [0.6, 1],  [1.12, 1],  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      return { opacity: Math.min(1, p * 4), transform: `scale(${scale.toFixed(4)})` };
    }
    case 'rise': {
      const ty = interpolate(p, [0, 1], [26, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      return { opacity: Math.min(1, p * 2.5), transform: `translateY(${ty.toFixed(2)}px)` };
    }
    case 'fade-in':
    default:
      return { opacity: p, transform: '' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPTION TEMPLATE SYSTEM — 자막 플레이 팔레트 (founder 2026-07-12 "전부 구현 + 시의적절 템플릿화")
// 자막 = {진입모션 + 감정데코 + 시맨틱팔레트 + 키워드모션}의 이름있는 조합(템플릿).
// 씬 감정에 맞춰 자동 선택되고(autoCaptionTemplate), clip.attributes.caption_template 로
// 명시 지정 시 그게 우선. 전부 frame-driven(useCurrentFrame) → preview==render, Modal-0.
// REC-0047 준수: 본문은 줄단위 리빌 유지(단어단위 카라오케 절대 금지). 다양성은 데코+키워드모션+
// 진입+색으로만 준다 — 본문 가독성은 불변. 주황 blanket 강조는 계속 오프; 색은 이제 씬 감정에
// 맞춘 '시맨틱'으로만(plain=흰색). founder "너무 그런것 같아"(전부 컬러) 해소.
// ═══════════════════════════════════════════════════════════════════════════════
type CaptionDeco = 'none' | 'flame' | 'spark' | 'impact' | 'drops' | 'doubt' | 'beat';
type CaptionKwMotion = 'none' | 'glitch' | 'spin' | 'count' | 'wave' | 'pulse';
type CaptionPalette = 'default' | 'trust' | 'urgent' | 'calm' | 'hype' | 'metric';
interface CaptionTemplate {
  entrance: string;          // 컨테이너 진입 (pop/bounce/slide-in/fade-in/rise) — 명시 caption_type 있을 때만 발화
  kwMotion: CaptionKwMotion; // 키워드 액센트 모션 (본문 가독성 불변)
  deco: CaptionDeco;         // 감정 데코 (글자 주변 불꽃·반짝·물방울 등 — founder 콕집)
  palette: CaptionPalette;   // 키워드 색 계열 (시맨틱; default=흰색)
}
const CAPTION_PALETTE_HEX: Record<CaptionPalette, string | undefined> = {
  default: undefined, // 흰색 (컬러 강조 없음 — 대다수 자막이 여기)
  trust: '#4db6ff',   // 인증/안전/증거
  urgent: '#ff5a52',  // CTA/마감/한정
  calm: '#5fe0a8',    // 안심/자연/개운
  hype: '#ffcf3f',    // 열정/충격/강조
  metric: '#2fcf6b',  // 숫자/수치 (초록 — 기존 규칙 유지)
};
// 이름있는 템플릿 (시의 적절하게 골라 쓰거나 자동 매핑). deco가 감정의 얼굴.
const CAPTION_TEMPLATES: Record<string, CaptionTemplate> = {
  plain:    { entrance: 'pop',      kwMotion: 'none',   deco: 'none',   palette: 'default' },
  question: { entrance: 'rise',     kwMotion: 'none',   deco: 'doubt',  palette: 'default' }, // 문제제기/의문
  shock:    { entrance: 'bounce',   kwMotion: 'glitch', deco: 'impact', palette: 'hype' },    // 충격/반전
  hype:     { entrance: 'pop',      kwMotion: 'pulse',  deco: 'flame',  palette: 'hype' },     // 열정/강조
  fresh:    { entrance: 'pop',      kwMotion: 'wave',   deco: 'spark',  palette: 'calm' },     // 개운/선명/맑음
  product:  { entrance: 'pop',      kwMotion: 'none',   deco: 'drops',  palette: 'default' },  // 제품 결(물/세척)
  proof:    { entrance: 'pop',      kwMotion: 'none',   deco: 'spark',  palette: 'trust' },    // 인증/후기/증거
  metric:   { entrance: 'pop',      kwMotion: 'count',  deco: 'none',   palette: 'metric' },   // 숫자/수치
  cta:      { entrance: 'bounce',   kwMotion: 'pulse',  deco: 'none',   palette: 'urgent' },   // 행동유도
  reveal:   { entrance: 'slide-in', kwMotion: 'spin',   deco: 'spark',  palette: 'hype' },     // 변신/공개
  heartbeat:{ entrance: 'pop',      kwMotion: 'pulse',  deco: 'beat',   palette: 'hype' },     // 설렘/기대
};
// 감정 자동 매핑 어휘 (deterministic). 텍스트 우선 → 없으면 sceneType.
const CAPTION_EMO_RE = {
  metric: /[0-9]\s*%|[0-9]\s*배|[0-9][0-9,]*\s*원|[0-9]+\s*(시간|분|초|회|일|주|개월|년)/,
  shock: /충격|대박|미쳐|미친|폭발|레전드|실화|소름|역대급|헐|경악|말도\s*안/,
  cta: /지금|딱|오늘|마감|한정|바로|서둘|놓치|클릭|링크|구매|주문|신청|담기/,
  proof: /인증|테스트|통과|안전|무자극|공인|규격|후기|리뷰|검증|OECD|특허|성분|임상/i,
  water: /물|수영|헹|세척|린스|김서림|안개|포그|서리|습기/,
  fresh: /선명|깨끗|맑|개운|산뜻|뽀송|투명|시원|촉촉|깔끔|또렷/,
  hype: /진짜|최고|강력|완전|찐|인생|필수|제대로|끝판|미쳤|확실/,
  heartbeat: /설렘|두근|기대|떨려|처음|첫\s|반했|사랑/,
  question: /[?？]/,
};
function autoCaptionTemplate(sceneType: SceneType, text: string): string {
  const t = text || '';
  // 우선순위: 의도(충격→행동유도→증거) > 수치 > 질문 > 결(물/개운) > 톤(열정/설렘).
  // CTA·proof는 숫자를 품어도 의도가 지배 → metric보다 먼저. 질문(?)은 결(fresh)보다 먼저(문제 훅 보호).
  if (CAPTION_EMO_RE.shock.test(t)) return 'shock';
  if (CAPTION_EMO_RE.cta.test(t) || sceneType === 'cta') return 'cta';
  if (CAPTION_EMO_RE.proof.test(t) || sceneType === 'proof') return 'proof';
  if (CAPTION_EMO_RE.metric.test(t)) return 'metric';
  if (CAPTION_EMO_RE.question.test(t)) return 'question';
  if (CAPTION_EMO_RE.water.test(t) || CAPTION_EMO_RE.fresh.test(t)) return 'fresh';
  if (CAPTION_EMO_RE.hype.test(t)) return 'hype';
  if (CAPTION_EMO_RE.heartbeat.test(t)) return 'heartbeat';
  if (sceneType === 'product') return 'product';
  if (sceneType === 'hook') return 'question'; // 훅은 대개 문제제기 톤
  return 'plain';
}
function resolveCaptionTemplate(clip: RenderClip, sceneType: SceneType, text: string): CaptionTemplate {
  const attrs = (clip.attributes ?? {}) as Record<string, unknown>;
  const explicit = typeof attrs.caption_template === 'string' ? attrs.caption_template.trim() : '';
  const name = CAPTION_TEMPLATES[explicit] ? explicit : autoCaptionTemplate(sceneType, text);
  return CAPTION_TEMPLATES[name] ?? CAPTION_TEMPLATES.plain;
}
// 키워드 액센트 모션 — 기존 키워드 transform 뒤에 append (본문 리빌 불변).
function kwMotionTransform(motion: CaptionKwMotion, frame: number, lineStart: number): string {
  const f = frame - lineStart;
  switch (motion) {
    case 'spin': // 진입 시 3D 플립 (10프레임)
      return `rotateY(${interpolate(f, [0, 10], [72, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }).toFixed(1)}deg)`;
    case 'count': // 숫자가 작게서 팡 (착지 오버슈트)
      return `scale(${interpolate(f, [0, 4, 9], [0.5, 1.25, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }).toFixed(3)})`;
    case 'wave': // 잔잔한 상하 물결 (지속)
      return `translateY(${(Math.sin(frame * 0.18) * 4).toFixed(2)}px)`;
    case 'pulse': // 심장박동 스케일 (지속, 양의 파형만)
      return `scale(${(1 + 0.07 * Math.max(0, Math.sin(frame * 0.5))).toFixed(3)})`;
    case 'glitch': { // ~1초마다 짧은 지직 (3프레임)
      const inBurst = frame % 30 < 3;
      return inBurst ? `translate(${(Math.sin(frame * 3.1) * 2.4).toFixed(1)}px, ${(Math.cos(frame * 2.7) * 1.4).toFixed(1)}px)` : '';
    }
    default:
      return '';
  }
}
// 감정 데코 레이어 — 자막 텍스트 블록 뒤/주변에 프레임 구동 장식. caption div(position:relative)
// 안에 zIndex:-1로 얹혀 텍스트를 따라다닌다. 전부 useCurrentFrame 결정론 → preview==render.
function CaptionDecoLayer({ deco, color }: { deco: CaptionDeco; color: string }) {
  const frame = useCurrentFrame();
  if (deco === 'none') return null;
  const wrap: React.CSSProperties = { position: 'absolute', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'visible' };
  if (deco === 'flame') {
    // 글자 아래 불길이 넘실 (열정/강조). 이중 겹불 flicker.
    const lick = (ph: number, amp: number) => 1 + amp * Math.sin((frame + ph) * 0.9);
    return (
      <span style={wrap}>
        <span style={{ position: 'absolute', left: '50%', bottom: -8, width: '58%', height: 74, transformOrigin: 'center bottom',
          transform: `translateX(-50%) scaleY(${lick(0, 0.2).toFixed(3)})`, borderRadius: '50% 50% 46% 46%', filter: 'blur(7px)', opacity: 0.8,
          background: 'radial-gradient(60% 100% at 50% 100%, #ffe24a 0%, #ff8a1e 44%, #ff2d1e 76%, transparent 90%)' }} />
        <span style={{ position: 'absolute', left: '50%', bottom: -4, width: '40%', height: 92, transformOrigin: 'center bottom',
          transform: `translateX(-52%) scaleY(${lick(11, 0.28).toFixed(3)})`, borderRadius: '50% 50% 44% 44%', filter: 'blur(5px)', opacity: 0.55,
          background: 'radial-gradient(55% 100% at 50% 100%, #fff2a8 0%, #ffb01e 40%, #ff5a1e 78%, transparent 92%)' }} />
      </span>
    );
  }
  if (deco === 'spark') {
    // 별빛이 톡톡 (기쁨/개운/증거). 고정 6점, 위상 stagger 삼각파.
    const pts = [[8, -14], [92, -6], [40, 108], [-4, 40], [102, 66], [64, -18]];
    return (
      <span style={wrap}>
        {pts.map(([x, y], i) => {
          const cyc = ((frame + i * 9) % 42) / 42; // 0..1
          const s = cyc < 0.4 ? interpolate(cyc, [0, 0.4], [0, 1.3]) : interpolate(cyc, [0.4, 0.7], [1.3, 0], { extrapolateRight: 'clamp' });
          return <span key={i} style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: 8, height: 8, marginLeft: -4, marginTop: -4,
            borderRadius: '50%', transform: `scale(${Math.max(0, s).toFixed(3)})`, opacity: Math.max(0, Math.min(1, s)),
            background: `radial-gradient(#fff 0%, ${color} 65%, transparent 100%)`, boxShadow: `0 0 8px ${color}` }} />;
        })}
      </span>
    );
  }
  if (deco === 'impact') {
    // 방사선 임팩트 (충격/반전). 첫 14프레임 버스트 + 느린 잔상 회전.
    const burst = interpolate(frame, [0, 6, 16], [0.4, 1.05, 1.35], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const burstOp = interpolate(frame, [0, 5, 16], [0, 0.7, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return (
      <span style={wrap}>
        <span style={{ position: 'absolute', inset: '-42% -28%', transform: `scale(${burst.toFixed(3)}) rotate(${(frame * 1.4).toFixed(1)}deg)`,
          opacity: burstOp, borderRadius: '50%',
          background: `repeating-conic-gradient(from 0deg, ${color}cc 0deg 7deg, transparent 7deg 22deg)` }} />
      </span>
    );
  }
  if (deco === 'drops') {
    // 물방울이 떨어진다 (제품 결: 물/세척). 4방울 loop.
    const drops = [[24, 0], [54, 14], [76, 26], [40, 38]];
    return (
      <span style={wrap}>
        {drops.map(([x, ph], i) => {
          const top = (((frame * 2.4 + ph * 3) % 130) - 15); // -15..115 %
          return <span key={i} style={{ position: 'absolute', left: `${x}%`, top: `${top.toFixed(1)}%`, width: 6, height: 9, marginLeft: -3,
            borderRadius: '0 60% 60% 60%', transform: 'rotate(45deg)', opacity: 0.8,
            background: 'linear-gradient(#cdeeff, #6fc7ff)', boxShadow: `0 0 5px ${color}88` }} />;
        })}
      </span>
    );
  }
  if (deco === 'doubt') {
    // 물음표가 떠오른다 (불안/의문). 3개 stagger 상승·페이드.
    const qs = [[6, '?'], [88, '?'], [70, '?']];
    return (
      <span style={wrap}>
        {qs.map(([x], i) => {
          const cyc = ((frame + i * 16) % 54) / 54;
          const op = cyc < 0.2 ? interpolate(cyc, [0, 0.2], [0, 1]) : interpolate(cyc, [0.6, 1], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const y = interpolate(cyc, [0, 1], [10, -28]);
          const rot = Math.sin((frame + i * 20) * 0.2) * 8;
          return <span key={i} style={{ position: 'absolute', left: `${x}%`, top: -12, transform: `translateY(${y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`,
            opacity: Math.max(0, op), fontSize: 44, fontWeight: 900, color: '#ffd23f', WebkitTextStroke: '3px #08070a',
            paintOrder: 'stroke fill' as React.CSSProperties['paintOrder'] }}>?</span>;
        })}
      </span>
    );
  }
  if (deco === 'beat') {
    // 두근두근 (설렘/기대). 텍스트 뒤 부드러운 맥동 글로우.
    const b = 1 + 0.12 * Math.max(0, Math.sin(frame * 0.55));
    return (
      <span style={wrap}>
        <span style={{ position: 'absolute', inset: '-18% -12%', transform: `scale(${b.toFixed(3)})`, borderRadius: '50%',
          background: `radial-gradient(60% 60% at 50% 50%, ${color}44 0%, transparent 72%)`, opacity: 0.9 }} />
      </span>
    );
  }
  return null;
}

function DynamicCaption({ clip, transformStyle, sceneType }: { clip: RenderClip; transformStyle: React.CSSProperties; sceneType: SceneType }) {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const localeConfig = useContext(LocaleConfigContext);
  const durationInFrames = msToDurationFrames(clip.durationMs, fps);
  const captionAttrs = (clip.attributes ?? {}) as Record<string, unknown>;
  // 키워드 색은 이제 자막 템플릿 팔레트(시맨틱)가 결정 — 구 brand_point_color/accent 경로는 은퇴
  // (founder 2026-07-12 blanket 주황 오프). 브랜드 포인트색은 TestimonialCard 등에서만 CAPTION_ACCENT 사용.
  // CTA scene = sharp everywhere; every other scene softens its 부수(non-keyword) words.
  const secondaryBlurPx = sceneType === 'cta' ? 0 : SECONDARY_CAPTION_BLUR_PX;
  // Caption strategy (founder 2026-06-15): the power-word is a COLORED word over the thick
  // black outline (NOT a box); metrics/money go green; emotional words get a micro-shake.
  const captionTextRaw = typeof clip.textContent === 'string' ? clip.textContent : '';
  const isEmotional = /[!?！？]|충격|대박|미쳐|미친|폭발|진짜|레전드|실화|소름|역대급|망했|실패/.test(captionTextRaw);
  const baseTextStyle = sceneType === 'hook' ? hookCaptionText : sceneType === 'proof' ? proofCaptionText : captionText;
  // CAPTION TEMPLATE (founder 2026-07-12 "전부 구현 + 시의적절 템플릿화"): 씬 감정 → 자막
  // 템플릿(데코·색·키워드모션·진입)을 자동 선택. clip.attributes.caption_template 명시 시 우선.
  const captionTemplate = resolveCaptionTemplate(clip, sceneType, captionTextRaw);
  const kwPaletteHex = CAPTION_PALETTE_HEX[captionTemplate.palette];
  const decoColor = ({
    none: 'transparent', flame: '#ff8a1e', drops: '#6fc7ff', doubt: '#ffd23f',
    beat: '#ff6b8a', spark: kwPaletteHex ?? '#ffe98a', impact: kwPaletteHex ?? '#ffffff',
  } as Record<CaptionDeco, string>)[captionTemplate.deco];
  const captionStyleEffect = effectByKind(clip, 'caption-style');
  const stickerEffect = effectByKinds(clip, ['caption-border-sticker', 'caption-flame', 'sticker']);
  const glowEffect = effectByKinds(clip, ['glow', 'caption-glow']);
  const popEffect = effectByKind(clip, 'caption-pop');
  const stickerVariant = stickerEffect?.kind === 'caption-flame'
    ? 'flame'
    : paramString(stickerEffect?.params?.variant, paramString(stickerEffect?.params?.style, 'border'));
  const stickerColor = paramString(stickerEffect?.params?.color, '#ff7a18');
  const glowColor = paramString(glowEffect?.params?.color, 'rgba(255, 209, 102, 0.78)');
  const resolvedFontSize =
    sceneType === 'proof'
      ? Number(baseTextStyle.fontSize)
      : paramNumber(captionStyleEffect?.params?.fontSize, Number(baseTextStyle.fontSize));
  const popScale = popEffect
    ? interpolate(frame, [0, 8, 16], [0.97, Math.min(paramNumber(popEffect.params?.scale, 1.03), 1.04), 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;
  // EDIT-2.2 + 2.3: per-type entrance animation + lag/hold.
  // Lag/hold only activate when caption_type is EXPLICITLY stamped on the clip so that
  // legacy clips (no caption_type attr) remain byte-identical to previous renders.
  // speaker-dialogue has lag=0 and entranceDurationMs=0 → fully byte-identical.
  const hasCaptionType = typeof captionAttrs.caption_type === 'string';
  const captionType = hasCaptionType ? (captionAttrs.caption_type as CaptionType) : 'speaker-dialogue';
  const typeConfig = CAPTION_DEFAULTS[captionType] ?? CAPTION_DEFAULTS['speaker-dialogue'];
  // 진입 우선순위: 명시 attr → 자막 템플릿 → caption_type 기본. (진입은 caption_type 있을 때만 발화 —
  // 레거시 클립은 entranceDurationFrames=0 이라 byte-identical.)
  const entranceEffect = (captionAttrs.caption_entrance_effect as string | undefined) ?? captionTemplate.entrance ?? typeConfig.entranceEffect;
  const entranceDurationMs = typeConfig.entranceDurationMs;
  // EDIT-2.3: lag — caption appears lagMs after clip startMs.
  const lagMs = hasCaptionType
    ? resolveCaptionLagMs(captionType, typeof captionAttrs.caption_lag_ms === 'number' ? captionAttrs.caption_lag_ms as number : undefined)
    : 0;
  // EDIT-2.3: hold — caption stays visible for at most holdMs after it appears.
  const holdMs = hasCaptionType
    ? resolveCaptionHoldMs(captionType, typeof captionAttrs.caption_hold_ms === 'number' ? captionAttrs.caption_hold_ms as number : undefined)
    : 0;
  const lagFrames = lagMs > 0 ? Math.max(1, Math.round((lagMs / 1000) * fps)) : 0;
  const holdFrames = holdMs > 0 ? Math.round((holdMs / 1000) * fps) : 0;
  // captionFrame: frame relative to caption's visible start (0 = first visible frame after lag).
  const captionFrame = Math.max(0, frame - lagFrames);
  const entranceDurationFrames = entranceDurationMs > 0 ? Math.max(1, Math.round((entranceDurationMs / 1000) * fps)) : 0;
  const entranceProgress = entranceDurationFrames > 0
    ? interpolate(captionFrame, [0, entranceDurationFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1;
  const typeEntrance = applyTypeEntranceAnimation(entranceEffect, entranceProgress);
  const resolvedCaptionText: React.CSSProperties = {
    ...baseTextStyle,
    // Locale-aware font fallback (ko ⇒ identical to baseTextStyle's CAPTION_FONT).
    fontFamily: captionFontFor(localeConfig),
    color: paramString(captionStyleEffect?.params?.color, '#fff'),
    background: paramString(captionStyleEffect?.params?.background, 'transparent'),
    fontSize: resolvedFontSize,
    fontWeight: paramNumber(captionStyleEffect?.params?.fontWeight, Number(baseTextStyle.fontWeight)),
    transform: `scale(${popScale})`,
    border: stickerEffect && stickerVariant === 'border' ? `3px solid ${stickerColor}` : baseTextStyle.border,
    // Caption glow (founder 2026-06-15 "NOT a box"): glow the TEXT only (textShadow below),
    // never the container. The old boxShadow halo wrapped the caption div's bounding rectangle,
    // which rendered as an orange frame around the whole caption — exactly the box the founder
    // rejected. Keep the glow on the glyphs; drop the rectangular halo.
    boxShadow: baseTextStyle.boxShadow,
    textShadow: glowEffect ? `0 0 16px ${glowColor}, 0 0 8px ${glowColor}, 0 2px 8px rgba(0,0,0,0.5)` : baseTextStyle.textShadow,
    position: 'relative',
    overflow: 'visible',
    // LOOP_UIUX TRACK B: proof captions WRAP like every other beat (was 'nowrap', which
    // clipped the social-proof line off-frame and forced the tiny 38px size). Now uniform.
    whiteSpace: baseTextStyle.whiteSpace,
  };
  // Up to 3 lines now that the band is taller (400px) — long proof/review lines wrap
  // instead of overflowing the width at the new uniform 100px size.
  const lines = captionLineGroups(clip.textContent, 3, localeConfig.charsPerLine, localeConfig.lineBreak);
  const revealStep = Math.max(10, Math.min(18, Math.floor(durationInFrames / Math.max(lines.length + 1, 3))));
  // REC-0047 개정 (2026-07-10 founder): 카라오케 '제한 해제' — 단 줄(line) 단위만.
  // 각 줄은 자기 첫 단어의 발화 시점(wordTimings)에 나타난다. 단어 단위 리빌은 계속 금지.
  // wordTimings 없는 레거시 클립은 기존 고정 간격(revealStep) 그대로 — byte-identical.
  const _wt = Array.isArray(clip.wordTimings) ? clip.wordTimings : [];
  const _lineWordCountsPre = lines.map((l) => l.split(/\s+/).filter(Boolean).length);
  const lineStartFrames = lines.map((_, li) => {
    const off = _lineWordCountsPre.slice(0, li).reduce((sum, n) => sum + n, 0);
    const w = _wt[off] as { startMs?: number } | undefined;
    return w && Number.isFinite(w.startMs)
      ? Math.max(0, Math.round(((w.startMs as number) / 1000) * fps))
      : li * revealStep;
  });
  // REC-0047 (founder 2026-06-18 "실패, 이상함"): per-word karaoke = 절대 구현금지. Both the
  // en 'subtle-karaoke' option and the per-clip caption_karaoke opt-in are DROPPED. Only the
  // ko phrase-level keyword emphasis (Market-grade caption emphasis above) survives. Hard off.
  const isKaraoke = false;
  const karaokeWordTimings = isKaraoke && Array.isArray(clip.wordTimings) ? clip.wordTimings : [];
  // Global word index per line so karaoke timing spans the whole caption, not each line.
  const lineWordCounts = lines.map((l) => l.split(/\s+/).filter(Boolean).length);
  const totalCaptionWords = lineWordCounts.reduce((sum, n) => sum + n, 0);

  // EDIT-2.3: lag window — caption is invisible until lagFrames have elapsed.
  // Skipped (lagFrames=0) for legacy clips and speaker-dialogue → byte-identical.
  if (lagFrames > 0 && frame < lagFrames) return null;
  // EDIT-2.3: hold window — caption hides after holdMs of visibility.
  // Skipped (holdFrames=0) for legacy clips → byte-identical.
  if (holdFrames > 0 && captionFrame >= holdFrames) return null;

  // TMPL-6DO: read 六道 position preset from clip attributes.
  const captionPosition = typeof captionAttrs.caption_position === 'string' ? captionAttrs.caption_position : undefined;

  return (
    <AbsoluteFill style={{
      ...transformStyle,
      ...captionContainerForScene(sceneType, captionPosition),
      // EDIT-2.2: blend entrance opacity multiplicatively and append entrance transform.
      // When typeEntrance = {opacity:1, transform:''} (speaker-dialogue / fully revealed)
      // neither branch fires → style is byte-identical to the previous render path.
      ...(typeEntrance.opacity < 1
        ? { opacity: typeEntrance.opacity * ((transformStyle.opacity as number | undefined) ?? 1) }
        : {}),
      ...(typeEntrance.transform
        ? { transform: [transformStyle.transform, typeEntrance.transform].filter(Boolean).join(' ') }
        : {}),
    }}>
      <div style={resolvedCaptionText}>
        {stickerEffect && stickerVariant !== 'border' ? (
          <span
            style={{
              position: 'absolute',
              inset: stickerVariant === 'flame' ? -14 : -9,
              zIndex: -1,
              borderRadius: stickerVariant === 'ring' ? 999 : 10,
              border: stickerVariant === 'ring' ? `4px solid ${stickerColor}` : undefined,
              background:
                stickerVariant === 'flame'
                  ? `conic-gradient(from ${frame * 8}deg, transparent 0 12%, ${stickerColor} 18%, #ffd166 24%, transparent 34% 52%, ${stickerColor} 60%, transparent 72% 100%)`
                  : undefined,
              filter: stickerVariant === 'flame' ? 'blur(2px)' : `drop-shadow(0 0 14px ${stickerColor})`,
              opacity: paramNumber(stickerEffect.params?.opacity, 0.8),
            }}
          />
        ) : null}
        {/* 감정 데코 (불꽃·반짝·임팩트·물방울·의심·두근) — 텍스트 뒤에서 frame 구동 */}
        {captionTemplate.deco !== 'none' ? <CaptionDecoLayer deco={captionTemplate.deco} color={decoColor} /> : null}
        {lines.map((line, i) => {
          const isLast = i === lines.length - 1;
          const lineStart = lineStartFrames[i]; // 발화 동기 (레거시=고정 간격 폴백)
          const t = captionFrame - lineStart; // EDIT-2.3: use captionFrame so reveal starts after lag
          const lineOpacity = interpolate(t, [0, 5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          // snappy punch-in with overshoot (deliberate 2026 pacing, not a soft fade)
          const lineScale = interpolate(t, [0, 6, 12], [0.8, 1.05, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const lineY = interpolate(t, [0, 8], [22, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const words = line.split(/\s+/).filter(Boolean);
          const kw = captionKeywordIndex(words, isLast);
          const markerGrow = interpolate(t, [4, 13], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          // Words in earlier lines, so the karaoke fill is continuous across the caption.
          const lineWordOffset = lineWordCounts.slice(0, i).reduce((sum, n) => sum + n, 0);
          return (
            <span
              key={i}
              style={{
                display: 'block',
                opacity: lineOpacity,
                transform: `translateY(${lineY}px) scale(${lineScale})`,
                transformOrigin: 'center bottom',
                // LOOP_UIUX TRACK B: proof line wraps (no nowrap clip) like the rest.
                whiteSpace: undefined,
              }}
            >
              {words.map((word, wi) => {
                const isKey = wi === kw;
                // Power-word = COLORED word over the outline (no box). Metrics/money → green
                // (#2fcf6b), everything else → the brand point color. It pops to 1.08 as it
                // lands; emotional captions add a 2-3px micro-shake (kinetic, speech-synced feel).
                const kwIsMetric = isKey && /[0-9%]|원|만|천|억|배|위|등/.test(word);
                // 키워드 색 = 자막 템플릿 팔레트(시맨틱). metric 숫자는 항상 초록. plain 템플릿=undefined
                // (흰색). blanket 주황 강조는 계속 오프(founder "너무 그런것 같아") — 색은 감정별로만.
                const kwColor = isKey ? (kwIsMetric ? CAPTION_PALETTE_HEX.metric : kwPaletteHex) : undefined;
                const kwScale = isKey
                  ? interpolate(markerGrow, [0, 1], [1, 1.08], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
                  : 1;
                const shakeX = isKey && isEmotional ? Math.sin((frame - lineStart) * 1.7) * 2.4 : 0;
                // 키워드 액센트 모션 (glitch/spin/count/wave/pulse) — 기존 transform 뒤에 append.
                const kwMx = isKey ? kwMotionTransform(captionTemplate.kwMotion, frame, lineStart) : '';
                // B-CAPSTYLE karaoke (en only): null for ko/zh → every term below collapses
                // to the legacy value, so the phrase-accent render stays byte-identical.
                const globalWi = lineWordOffset + wi;
                const karaokeTiming = isKaraoke && karaokeWordTimings[globalWi]
                  ? {
                      startF: msToDurationFrames(karaokeWordTimings[globalWi].startMs, fps),
                      endF: msToDurationFrames(karaokeWordTimings[globalWi].endMs, fps),
                    }
                  : null;
                const karaoke = isKaraoke
                  ? karaokeWordState(globalWi, totalCaptionWords, frame, durationInFrames, karaokeTiming)
                  : null;
                return (
                  <span key={wi} style={{ position: 'relative', display: 'inline-block', whiteSpace: 'pre' }}>
                    <span
                      style={{
                        color: isKey ? kwColor : undefined,
                        display: 'inline-block',
                        // Karaoke scale MULTIPLIES the key-word pop (kwScale*1 === kwScale, so
                        // ko keeps the exact same string); non-key words pick up the karaoke
                        // micro-bump only when karaoke is active, else stay transform-less.
                        transform: isKey
                          ? `translateX(${shakeX}px) scale(${kwScale * (karaoke ? karaoke.scale : 1)}) ${kwMx}`.trim()
                          : karaoke
                            ? `scale(${karaoke.scale})`
                            : undefined,
                        transformOrigin: 'center bottom',
                        // Karaoke fill: dim upcoming words, hold spoken/current at full.
                        opacity: karaoke ? karaoke.opacity : undefined,
                        textShadow: isKey && kwColor
                          ? `0 0 14px ${kwColor}55, ${String(baseTextStyle.textShadow ?? '')}`
                          : undefined,
                        // 흐릿한 글자=블러: 부수(non-key) words recede; key word stays sharp.
                        filter: !isKey && secondaryBlurPx > 0 ? `blur(${secondaryBlurPx}px)` : undefined,
                        willChange: isKey || karaoke ? 'transform' : undefined,
                      }}
                    >
                      {word}
                    </span>
                    {wi < words.length - 1 ? ' ' : ''}
                  </span>
                );
              })}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

const WATERMARK_POSITIONS: Record<string, React.CSSProperties> = {
  tl: { top: '5%', left: '5%' },
  tc: { top: '5%', left: '50%', transform: 'translateX(-50%)' },
  tr: { top: '5%', right: '5%' },
  ml: { top: '50%', left: '5%', transform: 'translateY(-50%)' },
  mc: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  mr: { top: '50%', right: '5%', transform: 'translateY(-50%)' },
  bl: { bottom: '5%', left: '5%' },
  bc: { bottom: '5%', left: '50%', transform: 'translateX(-50%)' },
  br: { bottom: '5%', right: '5%' },
};

// EDIT-4.1: emoji overlay entrance animations ─────────────────────────────────
function applyEmojiEntrance(
  effect: 'pop' | 'scale-pop' | 'bounce' | string,
  progress: number,
): { opacity: number; transform: string } {
  const p = Math.max(0, Math.min(1, progress));
  if (p >= 1) return { opacity: 1, transform: 'scale(1)' };
  switch (effect) {
    case 'pop': {
      const scale = interpolate(p, [0, 0.6, 1], [0, 1.2, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      return { opacity: p < 0.1 ? 0 : 1, transform: `scale(${scale.toFixed(4)})` };
    }
    case 'scale-pop': {
      const scale = interpolate(p, [0, 1], [0.3, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      return { opacity: Math.min(1, p * 4), transform: `scale(${scale.toFixed(4)})` };
    }
    case 'bounce': {
      const scale = p < 0.6
        ? interpolate(p, [0, 0.6], [0.2, 1.15], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        : interpolate(p, [0.6, 1], [1.15, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      return { opacity: Math.min(1, p * 5), transform: `scale(${scale.toFixed(4)})` };
    }
    default:
      return { opacity: p, transform: `scale(1)` };
  }
}

// Named position slots for emoji overlays
const EMOJI_POSITION_STYLES: Record<string, React.CSSProperties> = {
  'top-right': { position: 'absolute', top: '12%', right: '8%' },
  'bottom-center': { position: 'absolute', bottom: '22%', left: '50%', transform: 'translateX(-50%)' },
  'center': { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
};

function EmojiOverlay({ effect, fps }: { effect: import('@hiob/timeline').Effect; fps: number }) {
  const frame = useCurrentFrame();
  const params = (effect.params ?? {}) as {
    emoji?: string;
    mode?: 'inline' | 'floating' | 'sticker';
    position?: { x: number; y: number } | string;
    size?: number;
    entranceDurationMs?: number;
    holdMs?: number;
    entranceEffect?: 'pop' | 'scale-pop' | 'bounce';
  };
  const emoji = params.emoji ?? '✨';
  const size = params.size ?? 120;
  const entranceDurationMs = params.entranceDurationMs ?? 200;
  const holdMs = params.holdMs ?? 400;
  const entranceEffect = params.entranceEffect ?? 'pop';

  const entranceDurationFrames = Math.max(1, Math.round(entranceDurationMs / 1000 * fps));
  const holdFrames = holdMs > 0 ? Math.round(holdMs / 1000 * fps) : 0;

  if (holdFrames > 0 && frame >= holdFrames) return null;

  const entranceProgress = interpolate(
    frame,
    [0, entranceDurationFrames],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const { opacity, transform: entranceTransform } = applyEmojiEntrance(entranceEffect, entranceProgress);

  // Resolve position
  const pos = params.position;
  let posStyle: React.CSSProperties;
  if (typeof pos === 'string' && EMOJI_POSITION_STYLES[pos]) {
    posStyle = { ...EMOJI_POSITION_STYLES[pos] };
  } else if (pos && typeof pos === 'object' && 'x' in pos) {
    posStyle = { position: 'absolute', left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' };
  } else if (params.mode === 'floating' || !pos) {
    posStyle = { ...EMOJI_POSITION_STYLES['top-right'] };
  } else if (params.mode === 'inline') {
    posStyle = { ...EMOJI_POSITION_STYLES['bottom-center'] };
  } else {
    posStyle = { ...EMOJI_POSITION_STYLES['top-right'] };
  }

  // Merge entrance transform with position transform (translate must stay)
  const baseTransform = posStyle.transform ?? '';
  const finalTransform = [baseTransform, entranceTransform].filter(Boolean).join(' ');

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          ...posStyle,
          transform: finalTransform,
          opacity,
          fontSize: `${size}px`,
          lineHeight: 1,
          userSelect: 'none',
        }}
      >
        {emoji}
      </div>
    </AbsoluteFill>
  );
}

function Watermark({ clip, containerStyle }: { clip: RenderClip; containerStyle: React.CSSProperties }) {
  const effect = effectByKind(clip, 'watermark');
  if (!effect) return null;

  const mode = paramString(effect.params?.mode, 'repeated');
  const text = paramString(effect.params?.text, clip.textContent ?? 'HI-OB');
  const url = paramString(effect.params?.url, '');
  const opacity = (paramNumber(containerStyle.opacity, 1) ?? 1) * paramNumber(effect.params?.opacity, 0.16);

  // Logo image or single text mark anchored to a 9-grid position.
  if (mode === 'single' || url) {
    const pos = WATERMARK_POSITIONS[paramString(effect.params?.position, 'br')] ?? WATERMARK_POSITIONS.br;
    const sizePct = Math.max(5, Math.min(60, paramNumber(effect.params?.size, url ? 22 : 30)));
    return (
      <AbsoluteFill style={{ ...containerStyle, opacity, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', padding: '1%', width: url ? `${sizePct}%` : 'auto', ...pos }}>
          {url ? (
            <Img src={url} style={{ width: '100%', height: 'auto', objectFit: 'contain', display: 'block' }} />
          ) : (
            <span style={watermarkBox}>{text}</span>
          )}
        </div>
      </AbsoluteFill>
    );
  }

  if (mode === 'boxed') {
    return (
      <AbsoluteFill style={{ ...watermarkContainer, ...containerStyle, opacity }}>
        <span style={watermarkBox}>{text}</span>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ ...containerStyle, opacity, pointerEvents: 'none' }}>
      {Array.from({ length: 18 }).map((_, i) => (
        <span
          key={i}
          style={{
            ...watermarkRepeatedText,
            left: `${(i % 3) * 36 + 5}%`,
            top: `${Math.floor(i / 3) * 18 + 4}%`,
          }}
        >
          {text}
        </span>
      ))}
    </AbsoluteFill>
  );
}

type VoiceWindow = { startMs: number; endMs: number };

const DUCK_FADE_MS = 250;

function buildMusicVolumeFn(baseVolume: number, duckDepth: number, fps: number, voiceWindows: VoiceWindow[]): (f: number) => number {
  return (f: number) => {
    const gMs = (f / fps) * 1000;
    let weight = 0;
    for (const w of voiceWindows) {
      const fadeStart = w.startMs - DUCK_FADE_MS;
      const fadeEnd = w.endMs + DUCK_FADE_MS;
      if (gMs >= fadeStart && gMs < fadeEnd) {
        const fadeIn = Math.max(0, Math.min(1, (gMs - fadeStart) / DUCK_FADE_MS));
        const fadeOut = Math.max(0, Math.min(1, (fadeEnd - gMs) / DUCK_FADE_MS));
        weight = Math.max(weight, Math.min(fadeIn, fadeOut));
      }
    }
    return Math.max(0, baseVolume * (1 - weight * duckDepth));
  };
}

function ClipRenderer({ clip, mix, proofCutawayWindows, voiceWindows }: { clip: RenderClip; mix?: RenderProps['mix']; proofCutawayWindows: SceneWindow[]; voiceWindows: VoiceWindow[] }) {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const localeConfig = useContext(LocaleConfigContext);
  const scene_type = resolveSceneType(clip);
  const sceneLayer = resolveSceneLayer(clip, scene_type);
  const sceneTemplate = SCENE_TEMPLATES[scene_type];
  const globalMs = clip.startMs + (frame / fps) * 1000;
  // 좁쌀 제거(founder 2026-07-01): proof cutaway 비활성 — 사회증거가 나와도 hero를 인셋으로
  // 축소하거나 narrator를 숨기지 않는다. proof는 Artemis overlay의 몫.
  const inProofCutaway = false;
  const t = clip.transforms ?? { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };

  const opacity = applyKf(clip, 'opacity', t.opacity, frame, fps);
  const scale = applyKf(clip, 'scale', t.scale, frame, fps);
  const x = applyKf(clip, 'x', t.x, frame, fps);
  const y = applyKf(clip, 'y', t.y, frame, fps);
  const rotation = applyKf(clip, 'rotation', t.rotation, frame, fps);

  const durationInFrames = msToDurationFrames(clip.durationMs, fps);
  // E6 per-clip speed (playbackRate): the source plays faster/slower within the
  // clip's timeline window. Default 1 ⇒ no change (so clips without speed render
  // byte-identically — preview == render preserved).
  const speed = Math.max(0.25, Math.min(4, Number((clip.attributes as Record<string, unknown> | undefined)?.speed) || 1));
  const transformBase = `translate(${x * 50}%, ${y * 50}%) scale(${scale}) rotate(${rotation}deg)`;
  const transformStyle: React.CSSProperties = { transform: transformBase, opacity, width: '100%', height: '100%' };
  const effects = transformEffects(clip, frame, fps, durationInFrames);
  transformStyle.opacity = (transformStyle.opacity ?? 1) * effects.opacity;
  transformStyle.transform = `${transformStyle.transform ?? ''}${effects.transform}`;
  if (effects.filter) appendFilter(transformStyle, effects.filter);
  if (effects.clipPath) transformStyle.clipPath = effects.clipPath;
  // CapCut blend mode — composite this clip over the layer beneath (normal ⇒ untouched).
  if (effects.blendMode && effects.blendMode !== 'normal') {
    transformStyle.mixBlendMode = effects.blendMode as React.CSSProperties['mixBlendMode'];
  }

  const isAudioAsset = clip.assetKind === 'audio';
  // CDN stills often lack mime/extension (Seedream signed URLs) — trackKind video+url
  // is still a visual. Without this, isVisualAsset=false → 좁쌀 hard-ban never fires.
  const isVisualAsset =
    clip.assetKind === 'image' ||
    clip.assetKind === 'video' ||
    ((clip.trackKind === 'video' || clip.trackKind === 'overlay') && !!clip.url && !isAudioAsset);

  if (isAudioAsset || clip.trackKind === 'audio' || clip.trackKind === 'music' || clip.trackKind === 'sfx') {
    if (!clip.url) return null;
    const isMusicClip = clip.trackKind === 'music' || (isAudioAsset && clip.trackKind !== 'audio' && clip.trackKind !== 'sfx');
    const autoDuck = mix?.autoDuck && isMusicClip && voiceWindows.length > 0;
    const volumeProp = autoDuck
      ? buildMusicVolumeFn(mix?.music ?? 0.15, mix?.duck ?? 0.7, fps, voiceWindows)
      : resolveAudioVolume(clip, mix);
    return (
      <Audio
        src={clip.url}
        volume={volumeProp}
        startFrom={msToStartFrame(clip.inMs ?? 0, fps)}
        endAt={clip.outMs != null ? msToDurationFrames(clip.outMs, fps) : undefined}
        playbackRate={speed}
      />
    );
  }

  if (clip.trackKind === 'title' && !isVisualAsset) {
    if (inProofCutaway) return null;
    const watermark = effectByKind(clip, 'watermark');
    if (watermark) return <Watermark clip={clip} containerStyle={transformStyle} />;
    return (
      <AbsoluteFill style={{ ...titleContainer, ...transformStyle }}>
        <span style={{ ...titleText, fontFamily: captionFontFor(localeConfig) }}>{clip.textContent ?? ''}</span>
      </AbsoluteFill>
    );
  }

  if ((clip.trackKind === 'caption' || clip.trackKind === 'overlay') && !isVisualAsset) {
    const watermark = effectByKind(clip, 'watermark');
    if (watermark) return <Watermark clip={clip} containerStyle={transformStyle} />;
    return <DynamicCaption clip={clip} transformStyle={transformStyle} sceneType={inProofCutaway ? 'proof' : scene_type} />;
  }

  const isVideo = clip.assetKind === 'video' || (clip.url && /\.(mp4|webm|mov)(\?|$)/i.test(clip.url));
  // EDIT-PACING: sub-beat image variety — advance to a different image every SUBBEAT_MAX_MS.
  // sub_images[0] == primary image URL; sub_images[1..N] are manga-shot variants generated
  // in visual.py for long beats.  Renderer-side: frame is clip-local (0=clip start), so
  // tMs counts milliseconds from the START of this clip, not the timeline.
  const tMs = (frame / fps) * 1000;
  const rawSubImages = clipAttributes(clip).sub_images;
  const subImages: string[] = Array.isArray(rawSubImages)
    ? (rawSubImages as unknown[]).filter((u): u is string => typeof u === 'string' && u.length > 0)
    : [];
  const hasSubImages = subImages.length > 1 && !isVideo && clip.assetKind === 'image';
  const activeSubIdx = hasSubImages
    ? Math.min(Math.floor(tMs / SUBBEAT_MAX_MS), subImages.length - 1)
    : 0;
  const msIntoActiveSub = hasSubImages ? tMs - activeSubIdx * SUBBEAT_MAX_MS : tMs;
  const FLASH_MS = Math.max(1, (2 / fps) * 1000); // 2-frame flash opacity dip on cut
  const subBeatFlash = (hasSubImages && activeSubIdx > 0 && msIntoActiveSub < FLASH_MS)
    ? Math.max(0, msIntoActiveSub / FLASH_MS)
    : 1;
  // 좁쌀 제거(founder 2026-07-01): proof-frame 인셋 비활성 — 사회증거가 hero 이미지를 작은
  // 카드로 축소하지 않는다. 사회증거는 Artemis(에디터)가 full-bleed 위에 overlay로 얹는다.
  const proofFrame = false;
  const isProofHero = false;
  const isNarratorVisual = sceneLayer === 'narrator' && (isVisualAsset || clip.trackKind === 'video' || clip.trackKind === 'overlay');
  // LOOP_COMPOSE PROOF-CUTAWAY branch: hide the narrator ONLY while a proof HERO
  // asset is actually on-screen (inProofCutaway) — NOT for the whole proof scene.
  // Else a proof-tagged beat whose hero card sits elsewhere on the timeline (or is
  // missing) renders BLACK even though it has a perfectly good persona image
  // (founder bug 2026-06-04: bright lab-coat frame showed as a black screen).
  if (inProofCutaway && isNarratorVisual && !isProofHero) {
    return null;
  }
  // Manual framing wins over ambience: once the human sets an explicit scale or a
  // fit mode, the automatic ken-burns drift would fight their exact framing — turn
  // it off for that clip. Untouched clips (scale 1, no fit) keep the drift as before.
  const fitAttr = String(clipAttributes(clip).fit ?? '').toLowerCase();
  const hasManualFraming = scale !== 1 || fitAttr === 'contain' || fitAttr === 'cover' || x !== 0 || y !== 0;
  // Use beat position to vary ken-burns direction for consecutive narrator beats.
  // When narrator reuses the same image artifact across 3+ beats, clip.id is
  // identical → kenBurnsTransform returns the same direction every time.
  // narrator_beat_index (stamped by composer_v2.py) makes the key unique per beat.
  // Legacy fallback: absent field (-1) → original clip.id behavior, byte-identical.
  const narratorBeatIndex = Number(clipAttributes(clip).narrator_beat_index ?? -1);
  const motionClipId = hasSubImages && activeSubIdx > 0
    ? `${clip.id}_beat_${narratorBeatIndex}_sub_${activeSubIdx}`
    : narratorBeatIndex >= 0
      ? `${clip.id}_beat_${narratorBeatIndex}`
      : clip.id;
  // B-SHOT3: a B-SHOT2 sub-shot (transforms.scale != 1, stamped subshot_count>1) is a
  // STATIC reframe that would otherwise freeze (hasManualFraming). Give it a gentle
  // additive breath instead — keyed by sub-shot index so each crop drifts differently.
  // Genuine HUMAN manual framing (no subshot_count) still freezes, as the human intended.
  const subshotCount = Number(clipAttributes(clip).subshot_count ?? 0);
  const isSubshot = subshotCount > 1;
  // U-M1-EDIT-PACING: re-key Ken-Burns so each sub-image window starts from
  // frame 0 of its own 800ms window instead of the clip's global frame count.
  // Without this, all sub-images share the same mid-range progress value and
  // the "pan direction" doesn't reset — looping rather than cutting.
  const subDurationInFrames = Math.max(1, Math.round((SUBBEAT_MAX_MS * fps) / 1000));
  const frameIntoActiveSub = hasSubImages
    ? Math.max(0, frame - activeSubIdx * subDurationInFrames)
    : frame;

  // 2026-07-10 founder "비트마다 기계식 줌 1회": 모션 계획(keyframes)이 있으면 블랭킷
  // 켄번스를 끈다 — keyframes가 모션의 단일 권위, 켄번스는 계획 없는 레거시 클립 폴백으로 강등.
  const hasMotionKf = (clip.keyframes ?? []).some((k) => k.property === 'scale' || k.property === 'x' || k.property === 'y');
  const kb = isVideo || proofFrame || hasMotionKf || effectByKind(clip, 'ken-burns')
    ? { scale: 1, x: 0, y: 0 }
    : isSubshot
      ? subshotKenBurns(frame, durationInFrames, `${motionClipId}_ss_${Number(clipAttributes(clip).subshot_index ?? 0)}`)
      : hasManualFraming
        ? { scale: 1, x: 0, y: 0 }
        : hasSubImages
          ? kenBurnsTransform(frameIntoActiveSub, subDurationInFrames, motionClipId)
          : kenBurnsTransform(frame, durationInFrames, motionClipId);
  // BLACK-BEAT FIX (2026-06-17 ViewOK antifog): a social_proof beat's proof image is the
  // CENTERPIECE and must fill the frame. It is tagged scene_layer='narrator' (so the
  // SCENE_TEMPLATES['product'] pip-right rule would shrink it to a tiny bottom-right card)
  // but it is the ONLY visual on the beat — leaving the hero='full' slot empty, so the
  // frame rendered ~70% FALLBACK_BG black with a small product card floating in it. Render
  // the proof visual full-frame instead of a pip. Scoped to social_proof/proof visuals only
  // — every other product beat keeps its narrator pip, so non-proof reels stay byte-stable.
  // 2026-07-12 (founder "통째로 회귀·배선 잘못됐다"): scene-grammar-v2 의 인물 없는 제품/장면
  // 비주얼(product_solo·hands_demo·before_after·scene_no_person·situation_pov)은 그 비트의
  // HERO다 — 제품이 화면의 주인공이어야 한다. 이것들도 scene_layer='narrator'로 태그되므로
  // SCENE_TEMPLATES['product'].narrator='pip-right' 규칙에 걸려 tiny 우하단 카드로 축소됐다
  // (실사고: viewok 제품 컷이 검은 프레임에 좁쌀만한 제품). proof 비주얼과 동일하게 pip을
  // 우회해 풀블리드로 렌더한다. 발화 인물(persona/kol_narrator)만 narrator pip을 유지.
  const _clipRenderMode = String(clipAttributes(clip).render_mode ?? '').toLowerCase();
  const _clipProvider = String(
    clipAttributes(clip).provider ?? clipAttributes(clip).provider_model ?? '',
  ).toLowerCase();
  const isFullBleedSceneVisual = [
    'social_proof', 'product_solo', 'hands_demo', 'before_after', 'scene_no_person', 'situation_pov',
  ].includes(_clipRenderMode);
  const isProofVisual =
    isFullBleedSceneVisual ||
    String(clipAttributes(clip).scene_type ?? '').toLowerCase() === 'proof';
  // Rule 3·4 (founder 2026-07-12 "좁쌀 프레임은 짜쳐·절대 사용 안 한다"): SCENE_TEMPLATES의
  // 자동 narrator pip(250×360 검은 프레임 좁쌀)을 **전면 금지**. 모든 비주얼은 풀블리드로 렌더한다
  // — 자산이 화면 한 구석에 좁쌀만하게 뜨는 컷은 원천 차단(제품 회귀 재발 방지). isProofVisual/
  // pipBottom*는 하위호환 참조용으로 남기되 pip은 더 이상 만들지 않는다.
  void isProofVisual; void pipBottomLeft; void pipBottomRight;
  const pipStyle: React.CSSProperties | null = null;
  // ── 좁쌀 HARD BAN (founder 2026-07-20 EyeSafe — absolute) ─────────────────
  // Pip ban alone is NOT enough: Seedream parks a postage-stamp subject in black
  // 9:16. scale=1 cover still shows a tiny subject. Force crop-in on the MEDIA
  // (not only the container) so overflow:hidden on AbsoluteFill actually clips.
  // Opt-out: attributes.full_frame / no_subject_zoom. Persona talking-head exempt.
  const TALKING_HEAD_MODES = new Set(['persona', 'kol_narrator', 'avatar', 'talking_head']);
  const POSTAGE_STAMP_MODES = new Set([
    'situation_pov', 'scene_no_person', 'product_solo', 'hands_demo', 'before_after', 'social_proof',
  ]);
  const explicitSubjectZoom = Number(clipAttributes(clip).subject_zoom ?? 0);
  const optOutZoom = clipAttributes(clip).no_subject_zoom === true
    || clipAttributes(clip).full_frame === true;
  const isStillVisual = isVisualAsset && !isVideo;
  const isSeedreamStill =
    isStillVisual &&
    (_clipProvider.includes('seedream') || _clipProvider.includes('seedream-') || _clipProvider.includes('piapi'));
  // Only known postage-stamp generators (scene modes / Seedream / explicit zoom).
  // Do NOT blanket all video-track stills — that over-crops already-full product shots
  // (founder 2026-07-20: "이번에는 다 커졌잖아").
  const isPostageRisk =
    isStillVisual &&
    !optOutZoom &&
    !TALKING_HEAD_MODES.has(_clipRenderMode) &&
    (POSTAGE_STAMP_MODES.has(_clipRenderMode)
      || isSeedreamStill
      || explicitSubjectZoom >= 1.2);
  // Moderate crop: ban 우표 without turning every beat into ECU. Override via subject_zoom.
  const NARROWSSAL_MIN_SCALE = 2.4;
  let effectiveScale = scale;
  if (isVisualAsset && effectiveScale < 1) effectiveScale = 1; // card ban
  // Crop is applied by bloating media box (width/height %) + center translate — NOT
  // CSS scale() on a 100% box (Remotion <Img> can ignore/clip transforms).
  let mediaCropScale = 1;
  if (isPostageRisk) {
    const target = explicitSubjectZoom >= 1.2 ? explicitSubjectZoom : NARROWSSAL_MIN_SCALE;
    mediaCropScale = Math.max(1, target / Math.max(effectiveScale, 1));
  }
  // Cinematic motion (founder 2026-06-15, Rule-of-One): B-roll visuals SLIDE in
  // (directional, motion-blurred entrance), full talking-head shots get a subtle PUNCH-IN
  // emphasis. Either is layered over the ambient ken-burns drift — one entrance + one drift,
  // never a "Christmas tree". Both deterministic.
  const motionSeed = narratorBeatIndex >= 0 ? narratorBeatIndex * 7 : Math.round(clip.startMs / 400);
  const isTalkingHead = isNarratorVisual && !pipStyle;
  const pan = isVisualAsset && !isTalkingHead && !isProofHero && !hasMotionKf
    ? slidePanEntrance(frame, fps, pickDirection(motionSeed), { frames: 8 })
    : null;
  // 2026-07-10 founder "1초 지나고 두근": 발화 컷 무조건 punch-in(0.5s 지점 1.09 팝)이
  // 모션 계획과 무관하게 얹히던 하드코딩 — keyframes(모션 권위) 있으면 끈다. 입장 팬도 동일.
  const punch = isTalkingHead && !hasMotionKf
    ? ` ${punchInTransform(frame, fps, durationInFrames, { at: 0.5, zoom: 1.09, settle: 1.04 })}`
    : '';
  const visualStyle: React.CSSProperties = {
    ...transformStyle,
    transform: `${pan ? pan.transform + ' ' : ''}translate(${x * 50 + kb.x}%, ${y * 50 + kb.y}%) scale(${effectiveScale * kb.scale}) rotate(${rotation}deg)${effects.transform}${punch}`,
    // MERGE the entrance motion-blur with any effect-driven filter (chromatic-split,
    // look, adjust, glow). The old `pan?.filter ?? …` DROPPED the effect filter whenever
    // a B-roll clip also had a slide-pan entrance (pan.filter is 'blur(0px)' for most of
    // the clip), so those effects silently no-op'd on B-roll. Clips without an effect
    // filter keep transformStyle.filter undefined ⇒ result is just pan.filter (byte-stable).
    filter: pan
      ? [pan.filter, (transformStyle as React.CSSProperties).filter].filter(Boolean).join(' ')
      : (transformStyle as React.CSSProperties).filter,
    opacity: (transformStyle.opacity ?? 1) * (pan?.opacity ?? 1),
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    ...(isNarratorVisual && pipStyle ? pipStyle : null),
  };
  // attributes.fit: 'contain' shows the WHOLE uploaded asset (letterboxed) instead of
  // the default cover-crop. Absent attribute ⇒ cover, byte-identical to before.
  // 좁쌀: postage-risk scene stills NEVER letterbox (contain keeps the stamp small on black).
  const fitAttrEffective = isPostageRisk ? 'cover' : fitAttr;
  const baseMediaStyle = isProofHero ? proofCutawayMedia : proofFrame ? proofMedia : fitAttrEffective === 'contain' ? containMedia : coverMedia;
  // Auto-reframe: shift cover-crop focus via objectPosition. Absent/center ⇒ byte-identical.
  const reframeAnchor = REFRAME_POSITION[String(clipAttributes(clip).reframe ?? '').toLowerCase()];
  const baseReframed = reframeAnchor && baseMediaStyle.objectFit === 'cover'
    ? { ...baseMediaStyle, objectPosition: reframeAnchor }
    : baseMediaStyle;
  // CapCut chroma key — green-screen removal via an SVG filter referenced by url(). Absent (or
  // disabled via the effect stack toggle) ⇒ untouched.
  const chromaKeyRaw = effectByKind(clip, 'chroma-key');
  const chromaKey = chromaKeyRaw && (chromaKeyRaw as { disabled?: boolean }).disabled !== true ? chromaKeyRaw : null;
  const chromaId = chromaKey ? `ck-${String(clip.id).replace(/[^a-zA-Z0-9_-]/g, '')}` : '';
  const chromaDefs = chromaKey
    ? <ChromaKeyDefs id={chromaId} similarity={paramNumber(chromaKey.params?.similarity, 0.4)} />
    : null;
  // Bulletproof crop-zoom: oversized media box centered in AbsoluteFill (overflow:hidden).
  // Do NOT rely on transform:scale alone — Remotion Img defaults can fight it.
  const pct = (mediaCropScale * 100).toFixed(2);
  const mediaCrop: React.CSSProperties = mediaCropScale > 1.01
    ? {
        position: 'absolute',
        width: `${pct}%`,
        height: `${pct}%`,
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        maxWidth: 'none',
        maxHeight: 'none',
        objectFit: 'cover',
        objectPosition: reframeAnchor || 'center center',
      }
    : {};
  const mediaStyle = chromaKey
    ? { ...baseReframed, ...mediaCrop, filter: [(baseReframed as React.CSSProperties).filter, `url(#${chromaId})`].filter(Boolean).join(' ') }
    : { ...baseReframed, ...mediaCrop };

  if (!clip.url) {
    const spWording = String(clipAttributes(clip).social_proof_wording ?? '').trim();
    const spAttrib = String(clipAttributes(clip).social_proof_attribution ?? '').trim();
    if (spWording) {
      return <TestimonialCard wording={spWording} attribution={spAttrib} accentColor={CAPTION_ACCENT} />;
    }
    return (
      <AbsoluteFill style={{ background: 'oklch(20% 0.02 240)', opacity: transformStyle.opacity ?? 1 }}>
        <span style={placeholderText}>{clip.textContent ?? ''}</span>
        {effectOverlays(clip, frame, durationInFrames)}
      </AbsoluteFill>
    );
  }

  const isGif = !isVideo && !hasSubImages && /\.gif(\?|$)/i.test(clip.url ?? '');
  const media = hasSubImages ? (
    // EDIT-PACING: show a different manga-shot image every SUBBEAT_MAX_MS; 2-frame flash on cut.
    <div style={{ position: 'absolute', inset: 0, opacity: subBeatFlash }}>
      <Img src={subImages[activeSubIdx]} style={mediaStyle} />
    </div>
  ) : isVideo ? (
    <OffthreadVideo
      src={clip.url}
      startFrom={msToStartFrame(clip.inMs ?? 0, fps)}
      endAt={clip.outMs != null ? msToDurationFrames(clip.outMs, fps) : undefined}
      playbackRate={speed}
      style={mediaStyle}
    />
  ) : isGif ? (
    <Gif
      src={clip.url}
      fit={(mediaStyle.objectFit === 'contain' ? 'contain' : 'cover') as 'contain' | 'cover'}
      style={mediaStyle}
    />
  ) : (
    <Img src={clip.url} style={mediaStyle} />
  );

  if (isProofHero) {
    // The hero CARD honors the user's transforms (size/position/rotation from the
    // inspector). Identity transforms add no style at all, so untouched proof reels
    // render byte-identically — only deliberately edited clips change.
    const hasUserTransform = x !== 0 || y !== 0 || scale !== 1 || rotation !== 0 || effects.transform !== '';
    const heroCardStyle: React.CSSProperties = hasUserTransform
      ? { ...proofCutawayHeroCard, transform: `translate(${x * 50}%, ${y * 50}%) scale(${scale}) rotate(${rotation}deg)${effects.transform}` }
      : proofCutawayHeroCard;
    return (
      <AbsoluteFill style={{ ...proofCutawayBackdrop, opacity: visualStyle.opacity }}>
        <div style={heroCardStyle}>
          {media}
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ ...visualStyle, overflow: 'hidden' }}>
      {chromaDefs}
      {proofFrame ? (
        <AbsoluteFill style={{ ...proofFrameShell, overflow: 'hidden' }}>
          {media}
          <ProofStars />
        </AbsoluteFill>
      ) : (
        media
      )}
      {effectOverlays(clip, frame, durationInFrames)}
    </AbsoluteFill>
  );
}

// E1 bug 4: a caption track shows ONE caption at a time. Two caption clips that
// overlap in time (observed near the CTA on real produced reels) otherwise render
// stacked = unreadable. CapCut's magnetic track forbids overlap; mirror that at
// render time — and because this is the ONE composition shared by preview + Lambda,
// preview == render holds. An earlier caption is truncated to end exactly where the
// next caption begins: a deterministic, sequential hand-off. Reels whose captions
// don't overlap are returned UNCHANGED (byte-stable — no Phase-13 regression).
function resolveCaptionOverlaps(clips: RenderClip[]): RenderClip[] {
  const captions = clips
    .filter((c) => c.trackKind === 'caption' && c.assetKind !== 'image' && c.assetKind !== 'video' && c.assetKind !== 'audio')
    .sort((a, b) => a.startMs - b.startMs || String(a.id).localeCompare(String(b.id)));
  if (captions.length < 2) return clips;
  // E7C: GUARANTEE exactly one caption at any instant. The old version only
  // 1ms-shrank an overlapping earlier caption — a true DUPLICATE (e.g. the CTA
  // caption appended on top of a beat caption) still rendered as a flash. Now:
  // DROP exact-text / same-start duplicates and post-truncation slivers, and
  // truncate the rest to hand off cleanly.
  const MIN_MS = 150;
  const norm = (s?: string) => (s ?? '').replace(/\s+/g, ' ').trim();
  const dropped = new Set<string>();
  const trunc = new Map<string, number>();
  let last: RenderClip | null = null;
  let lastEnd = -1;
  for (const c of captions) {
    if (last && c.startMs < lastEnd) {
      if (norm(c.textContent) === norm(last.textContent) || c.startMs <= last.startMs + 1) {
        dropped.add(c.id); // exact duplicate / same-start → drop this one, keep `last`
        continue;
      }
      const newLastDur = c.startMs - last.startMs;
      if (newLastDur < MIN_MS) { dropped.add(last.id); } // `last` is a sliver → drop it
      else { trunc.set(last.id, newLastDur); }
    }
    last = c;
    lastEnd = c.startMs + c.durationMs;
  }
  if (dropped.size === 0 && trunc.size === 0) return clips;
  return clips
    .filter((c) => !dropped.has(c.id))
    .map((c) => (trunc.has(c.id) ? { ...c, durationMs: trunc.get(c.id) as number } : c));
}

// LOOP_UIUX C1 (founder confirm 2026-06-04: "show the top title on beat 0 only"). The
// always-on TOP TITLE is a SINGLE headline clip seeded by _seed_headline_title() spanning the
// WHOLE reel (start≈0). It competed with the per-beat caption on every frame. Clamp that headline
// clip's duration to the end of the HOOK beat (beat 0), so it shows on the opening beat only and
// beats 1+ carry ONE text focus.
//
// The hook-beat boundary = where beat 1 begins. Captions are one-per-beat and sequential
// (resolveCaptionOverlaps guarantees no overlap), so the 2nd caption's start — or the 1st
// caption's end when there is only one — is that boundary. We deliberately do NOT use
// clip.beatIndex: it is NOT populated on the render-time RenderClip (the DB→timeline render
// loader drops beat_index), so a beatIndex gate would silently no-op (the bug this replaces).
// Targets ONLY the auto headline (a non-watermark title that starts at ~0 and spans past the
// hook); human-scoped titles (non-zero start) and watermark clips are left untouched. Reels with
// no captions / no spanning headline are returned UNCHANGED (byte-stable).
function clampHeadlineTitleToHook(clips: RenderClip[]): RenderClip[] {
  const caps = clips
    .filter((c) => c.trackKind === 'caption' && c.assetKind !== 'image' && c.assetKind !== 'video' && c.assetKind !== 'audio')
    .map((c) => ({ start: c.startMs, end: c.startMs + c.durationMs }))
    .sort((a, b) => a.start - b.start);
  if (caps.length === 0) return clips;
  const hookEndMs = caps.length >= 2 ? caps[1].start : caps[0].end;
  if (hookEndMs <= 0) return clips;
  let changed = false;
  const out = clips.map((c) => {
    if (c.trackKind !== 'title') return c;
    if ((c.effects ?? []).some((e) => e.kind === 'watermark')) return c; // watermark spans by design
    const end = c.startMs + c.durationMs;
    if (c.startMs > 50 || end <= hookEndMs + 50) return c; // not the always-on headline
    changed = true;
    return { ...c, durationMs: Math.max(1, hookEndMs - c.startMs) };
  });
  return changed ? out : clips;
}

export function TimelineCompositionV2(props: RenderProps) {
  const { fps } = useVideoConfig();
  // Resolve the run's locale ONCE; absent/unknown ⇒ ko (byte-identical). The
  // resolved config flows to caption/title renderers via LocaleConfigContext.
  const localeConfig = resolveLocaleConfig(props.locale);
  const seenAudio = new Set<string>();
  const proofCutawayWindows = props.clips
    .filter((clip) => resolveSceneType(clip) === 'proof' && resolveSceneLayer(clip, 'proof') === 'hero')
    .map(clipWindow);
  // LOOP_COMPOSE z-order invariant: background(0) → HERO(1) → narrator/PIP(2)
  // → caption/title(3). Watermark clips remain topmost by design.
  const stackKey = (clip: RenderClip) => {
    if ((clip.effects ?? []).some((e) => e.kind === 'watermark')) return 10000;
    const scene_type = resolveSceneType(clip);
    const layer = resolveSceneLayer(clip, scene_type);
    if (layer === 'audio') return -1000 + clip.zIndex;
    if (layer === 'background') return 0 + clip.zIndex;
    if (layer === 'hero') return 1000 + clip.zIndex;
    if (layer === 'narrator') return 2000 + clip.zIndex;
    if (layer === 'caption') return 3000 + clip.zIndex;
    return clip.zIndex;
  };
  const sorted = clampHeadlineTitleToHook(resolveCaptionOverlaps(props.clips))
    .sort((a, b) => stackKey(a) - stackKey(b))
    .filter((clip) => {
      const isAudio = clip.assetKind === 'audio' || clip.trackKind === 'audio' || clip.trackKind === 'music' || clip.trackKind === 'sfx';
      if (!isAudio || !clip.url) return true;
      const key = `${clip.trackKind}|${clip.url}|${clip.startMs}`;
      if (seenAudio.has(key)) return false;
      seenAudio.add(key);
      return true;
    });
  // Voice time windows for audio ducking (ED-09).
  const voiceWindows: VoiceWindow[] = props.clips
    .filter((c) => c.trackKind === 'audio' && c.url)
    .map((c) => ({ startMs: c.startMs, endMs: c.startMs + c.durationMs }));
  // Scene-cut frames (hero/background visual entrances) drive the light-leak flashes.
  const transitionFrames = sorted
    .filter((clip) => {
      if (clip.assetKind !== 'image' && clip.assetKind !== 'video') return false;
      const layer = resolveSceneLayer(clip, resolveSceneType(clip));
      return layer === 'hero' || layer === 'background';
    })
    .map((clip) => msToStartFrame(clip.startMs, fps))
    .filter((f) => f > 2);
  return (
    <LocaleConfigContext.Provider value={localeConfig}>
      <AbsoluteFill style={{ background: FALLBACK_BG }}>
        {sorted.map((clip) => {
          const from = msToStartFrame(clip.startMs, fps);
          const duration = msToDurationFrames(clip.durationMs, fps);
          return (
            <Sequence key={clip.id} from={Math.max(0, from)} durationInFrames={duration}>
              <ClipRenderer clip={clip} mix={props.mix} proofCutawayWindows={proofCutawayWindows} voiceWindows={voiceWindows} />
            </Sequence>
          );
        })}
        {/* EDIT-4.1: emoji overlays — rendered as a second pass so they float above all clips */}
        {sorted.flatMap((clip) => {
          const emojiEffects = (clip.effects ?? []).filter((e) => e.kind === 'emoji-overlay');
          if (emojiEffects.length === 0) return [];
          const from = msToStartFrame(clip.startMs, fps);
          const duration = msToDurationFrames(clip.durationMs, fps);
          return emojiEffects.map((eff, i) => (
            <Sequence key={`emoji-${clip.id}-${i}`} from={Math.max(0, from)} durationInFrames={duration}>
              <EmojiOverlay effect={eff} fps={fps} />
            </Sequence>
          ));
        })}
        {/* Rule-of-One: brief warm light-leaks ONLY at scene cuts, then a subtle global film
            grain (premium texture that kills the AI gloss). Both deterministic + GPU-cheap. */}
        <LightLeak triggerFrames={transitionFrames} windowFrames={8} />
        <FilmGrain opacity={0.07} blend="overlay" />
      </AbsoluteFill>
    </LocaleConfigContext.Provider>
  );
}

// LOOP_COMPOSE HOOK: full-bleed hero can crop; the top title is pure white
// market text with a black outline, shared by preview and final render.
const titleContainer: React.CSSProperties = {
  alignItems: 'center',
  justifyContent: 'flex-start',
  padding: `${FRAME_ZONE.titleTop}px ${FRAME_ZONE.safeX}px 0 ${FRAME_ZONE.safeX}px`,
  pointerEvents: 'none',
};
const titleText: React.CSSProperties = {
  background: 'transparent',
  color: '#fff',
  padding: '0 4px 10px',
  boxSizing: 'border-box',
  fontFamily: CAPTION_FONT,
  // 2026-06-16 (founder "좀 작게"): hook title trimmed 112→88 (stroke 7→5) in step with the
  // smaller uniform caption, so the opening title no longer eats the upper third of the frame.
  fontSize: 88,
  fontWeight: 400,
  letterSpacing: 0,
  lineHeight: 1.08,
  textAlign: 'center',
  maxWidth: 920,
  overflowWrap: 'break-word',
  wordBreak: 'keep-all',
  whiteSpace: 'pre-line',
  WebkitTextStroke: '5px #08070a',
  paintOrder: 'stroke fill' as React.CSSProperties['paintOrder'],
  textShadow: '0 6px 0 rgba(0,0,0,0.58), 0 10px 18px rgba(0,0,0,0.65)',
};
function captionContainerForScene(scene_type: SceneType, captionPosition?: string): React.CSSProperties {
  if (scene_type === 'hook') {
    return {
      position: 'absolute',
      left: FRAME_ZONE.safeContent.x,
      top: 410,
      width: FRAME_ZONE.safeContent.width,
      height: 470,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 22px',
      boxSizing: 'border-box',
      pointerEvents: 'none',
    };
  }
  // TMPL-6DO: 六道 position override (non-hook beats only).
  // clip.attributes.caption_position 명시 시 Meta 세이프존 클램프 위치 사용.
  // SAFEZONE-DEFAULT (founder 2026-07-02, 1549d88): caption_position 미지정 클립이 레거시
  // captionBand(y1040+h400 → 하단 1440px)로 Meta 하단 세이프존(>1248px)을 침범 → mid-bottom 강제.
  // ⇒ sixDoPos는 || 'mid-bottom' 폴백으로 항상 정의. 아래 else의 captionBand 반환은 방어용(도달 불가):
  //   'mid-bottom' 상수 키가 사라진 경우에만 실행되는 안전망이라 의도적으로 유지한다.
  const sixDoPos = SIX_DO_CAPTION_POSITIONS[captionPosition || ''] || SIX_DO_CAPTION_POSITIONS['mid-bottom'];
  if (sixDoPos) {
    const clampedBottom = Math.min(sixDoPos.y + sixDoPos.height, META_SAFEZONE_BOTTOM);
    const clampedHeight = clampedBottom - sixDoPos.y;
    return {
      position: 'absolute',
      left: FRAME_ZONE.captionBand.x,
      top: sixDoPos.y,
      width: FRAME_ZONE.captionBand.width,
      height: clampedHeight,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 18px',
      boxSizing: 'border-box',
      pointerEvents: 'none',
    };
  }
  return {
    position: 'absolute',
    left: FRAME_ZONE.captionBand.x,
    top: FRAME_ZONE.captionBand.y,
    width: FRAME_ZONE.captionBand.width,
    height: FRAME_ZONE.captionBand.height,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 18px',
    boxSizing: 'border-box',
    pointerEvents: 'none',
  };
}
// Market-grade base caption (the "advanced team" look): box-less heavy display text
// whose readability comes from a thick stroke + layered shadow (NOT a flat box), so it
// pops over any footage. Editor caption-style effects can still override via resolvedCaptionText.
//
// LOOP_UIUX TRACK B (founder 2026-06-04, "크게 통일, not 들쭉날쭉"): every per-beat caption is
// ONE uniform size + one uniform stroke. hook/proof SPREAD this base and override ONLY layout
// (line-height / max-width), so all beats share one scale.
// 2026-06-16 (founder "캡션이 화면을 너무 꽉채워, 좀 작게"): dialed the uniform size down from
// 100→72 (stroke 6→4) so captions stop dominating the frame while staying bold/legible. Single
// knob — adjust UNIFORM_CAPTION_PX to retune.
const UNIFORM_CAPTION_PX = 72;
const UNIFORM_CAPTION_STROKE = '4px #08070a';
const captionText: React.CSSProperties = {
  background: 'transparent',
  color: '#fff',
  padding: '2px 0',
  fontFamily: CAPTION_FONT,
  fontSize: UNIFORM_CAPTION_PX,
  fontWeight: 400, // Black Han Sans is a single-weight black display font (already heavy)
  letterSpacing: 0,
  lineHeight: 1.1,
  textAlign: 'center',
  maxWidth: '98%',
  display: 'block',
  // outline-behind-fill so the stroke never eats the (dense) Korean glyphs
  WebkitTextStroke: UNIFORM_CAPTION_STROKE,
  paintOrder: 'stroke fill' as React.CSSProperties['paintOrder'],
  textShadow: '0 4px 16px rgba(0,0,0,0.55), 0 2px 3px rgba(0,0,0,0.92)',
  overflowWrap: 'break-word',
  wordBreak: 'keep-all',
  whiteSpace: 'normal',
};
const hookCaptionText: React.CSSProperties = {
  ...captionText,
  // SAME size as the base (uniform); the hook just runs a touch tighter + full width.
  lineHeight: 1.06,
  maxWidth: '100%',
};
const proofCaptionText: React.CSSProperties = {
  ...captionText,
  // SAME big uniform size as the base — no more tiny 38px proof line. Wraps (nowrap removed
  // in DynamicCaption) so the social-proof line is never clipped off-frame.
  maxWidth: '100%',
  textShadow: '0 3px 12px rgba(0,0,0,0.58), 0 2px 3px rgba(0,0,0,0.9)',
};
const coverMedia: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};
// Auto-reframe anchor (2026-07-05) — objectPosition shifts a cover-crop's focus in the 9:16
// frame so the subject stays visible instead of the default center crop. clip.attributes.reframe
// drives it (a CV worker can auto-set it; the editor sets it manually). Absent ⇒ center default.
const REFRAME_POSITION: Record<string, string> = {
  center: 'center center',
  top: 'center top',
  bottom: 'center bottom',
  left: 'left center',
  right: 'right center',
  'top-left': 'left top',
  'top-right': 'right top',
};
// attributes.fit === 'contain' — whole-asset view for uploaded media whose aspect
// doesn't match the 9:16 frame (e.g. founder-uploaded dashboard screenshots).
const containMedia: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'contain',
};
const pipBase: React.CSSProperties = {
  position: 'absolute',
  left: 90,
  top: 1030,
  right: 'auto',
  bottom: 'auto',
  width: 250,
  height: 360,
  borderRadius: 8,
  overflow: 'hidden',
  border: '3px solid rgba(255,255,255,0.86)',
  boxShadow: '0 16px 42px rgba(0,0,0,0.48)',
  background: '#000',
};
const pipBottomLeft: React.CSSProperties = pipBase;
const pipBottomRight: React.CSSProperties = {
  ...pipBase,
  left: 690,
};
const proofCutawayBackdrop: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(245,247,250,1), rgba(223,229,238,1))',
  boxSizing: 'border-box',
};
const proofCutawayHeroCard: React.CSSProperties = {
  position: 'absolute',
  left: FRAME_ZONE.safeContent.x,
  top: FRAME_ZONE.safeContent.y,
  width: FRAME_ZONE.safeContent.width,
  height: 960,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  border: '2px solid rgba(10,18,32,0.18)',
  boxShadow: '0 20px 54px rgba(20,28,40,0.24)',
  overflow: 'hidden',
  background: '#fff',
};
const proofCutawayMedia: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  background: '#fff',
};
const proofFrameShell: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '8% 5% 20%',
  background: 'linear-gradient(180deg, rgba(9,12,18,0.96), rgba(20,24,32,0.96))',
};
const proofMedia: React.CSSProperties = {
  width: '92%',
  height: '76%',
  objectFit: 'contain',
  borderRadius: 6,
  border: '2px solid rgba(255,255,255,0.76)',
  boxShadow: '0 18px 48px rgba(0,0,0,0.48)',
  background: 'rgba(255,255,255,0.96)',
};
// F2: real 5-star rating glyph (SVG) instead of the old empty highlight box.
const proofStarsRow: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: '11%',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  pointerEvents: 'none',
};
const STAR_PATH =
  'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z';
function TestimonialCard({ wording, attribution, accentColor }: { wording: string; attribution: string; accentColor: string }) {
  return (
    <AbsoluteFill style={{
      background: 'oklch(98% 0.01 60)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '80px 60px',
    }}>
      <ProofStars />
      <div style={{
        position: 'relative',
        marginTop: 48,
        background: '#fff',
        border: `4px solid ${accentColor}`,
        borderRadius: 24,
        padding: '64px 60px 52px',
        boxShadow: `10px 10px 0 ${accentColor}`,
        maxWidth: '100%',
      }}>
        <span style={{
          position: 'absolute', top: -20, left: 36,
          fontSize: 110, color: accentColor, lineHeight: 1,
          fontFamily: 'Georgia, "Times New Roman", serif', userSelect: 'none',
        }}>❝</span>
        <p style={{
          fontSize: 50,
          fontWeight: 700,
          lineHeight: 1.45,
          color: '#111',
          wordBreak: 'keep-all',
          margin: 0,
          marginTop: 16,
        }}>{wording}</p>
        {attribution ? (
          <p style={{
            fontSize: 34,
            color: '#666',
            marginTop: 28,
            fontWeight: 600,
            letterSpacing: '0.01em',
          }}>— {attribution}</p>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}

function ProofStars() {
  return (
    <div style={proofStarsRow}>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg
          key={i}
          width={96}
          height={96}
          viewBox="0 0 24 24"
          style={{ display: 'block', filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.5))' }}
        >
          <path
            d={STAR_PATH}
            fill="#FFC53D"
            stroke="#B9760A"
            strokeWidth={0.6}
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </div>
  );
}
const watermarkContainer: React.CSSProperties = {
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 6%',
};
const watermarkBox: React.CSSProperties = {
  color: '#fff',
  background: 'rgba(0,0,0,0.38)',
  border: '1px solid rgba(255,255,255,0.52)',
  borderRadius: 6,
  padding: '8px 14px',
  fontFamily: 'ui-sans-serif, -apple-system, "SF Pro Text", sans-serif',
  fontSize: 28,
  fontWeight: 700,
  letterSpacing: 0,
};
const watermarkRepeatedText: React.CSSProperties = {
  position: 'absolute',
  color: '#fff',
  fontFamily: 'ui-sans-serif, -apple-system, "SF Pro Text", sans-serif',
  fontSize: 30,
  fontWeight: 800,
  letterSpacing: 0,
  transform: 'translate(-50%, -50%) rotate(-24deg)',
  whiteSpace: 'nowrap',
};
const placeholderText: React.CSSProperties = {
  color: 'oklch(70% 0.02 240)',
  fontFamily: 'ui-sans-serif',
  fontSize: 28,
  textAlign: 'center',
  alignSelf: 'center',
  width: '100%',
  paddingTop: '40%',
};
