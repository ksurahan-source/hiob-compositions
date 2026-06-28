/**
 * Easing — canonical scalar easing library (single source of truth).
 *
 * Each function maps normalized progress t∈[0,1] → eased value. "back" and
 * "elastic" intentionally return values OUTSIDE [0,1] near the end so that an
 * `interpolate(p, [0,1], [a,b], { easing })` OVERSHOOTS past `b` and settles —
 * the anticipation/overshoot/settle that makes motion feel professionally
 * hand-crafted ("손맛"), not template-flat.
 *
 * Used by BOTH render paths so a keyframe's `easing` string means the same
 * thing everywhere:
 *   - live path  → TimelineCompositionV2 `applyKf` (clips[].keyframes)
 *   - ReelDoc    → elementRenderers `evaluateKfProperty` (Element.animations)
 *
 * Unknown names fall back to `linear` at the call site (safe no-op).
 */

export type EasingFn = (t: number) => number;

const c1 = 1.70158; // standard back-overshoot constant
const c2 = c1 * 1.525; // in-out back
const c3 = c1 + 1;

/** Cubic-bezier(p1x, p1y, p2x, p2y) → progress easing, Newton-solved. Matches CSS. */
export function cubicBezier(p1x: number, p1y: number, p2x: number, p2y: number): EasingFn {
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const solveX = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const x2 = sampleX(t) - x;
      if (Math.abs(x2) < 1e-5) return t;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= x2 / d;
    }
    return Math.max(0, Math.min(1, t));
  };
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return sampleY(solveX(t));
  };
}

export const EASING_FN: Record<string, EasingFn> = {
  // ── originals (kept byte-compatible so existing keyframes are unchanged) ──
  linear: (t) => t,
  ease: (t) => 1 - Math.pow(1 - t, 2.2),
  'ease-in': (t) => t * t,
  'ease-out': (t) => t * (2 - t),
  'ease-in-out': (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  spring: (t) => Math.sin(-13 * (Math.PI / 2) * (t + 1)) * Math.pow(2, -10 * t) + 1,

  // ── cubic ──
  'ease-in-cubic': (t) => t * t * t,
  'ease-out-cubic': (t) => 1 - Math.pow(1 - t, 3),
  'ease-in-out-cubic': (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),

  // ── quint (very snappy settle) ──
  'ease-out-quint': (t) => 1 - Math.pow(1 - t, 5),
  'ease-in-quint': (t) => t * t * t * t * t,

  // ── expo (fast exit, smooth land — the "whip" feel) ──
  'ease-in-expo': (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  'ease-out-expo': (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  'ease-in-out-expo': (t) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,

  // ── back (anticipation / overshoot — returns >1 near the end on purpose) ──
  'ease-in-back': (t) => c3 * t * t * t - c1 * t * t,
  'ease-out-back': (t) => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2),
  'ease-in-out-back': (t) =>
    t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2,

  // ── sine (smooth oscillation segments: parallax, wiggle, wave) ──
  'ease-in-out-sine': (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  'ease-out-sine': (t) => Math.sin((t * Math.PI) / 2),
  'ease-in-sine': (t) => 1 - Math.cos((t * Math.PI) / 2),
};

/** Resolve an easing name to a function; unknown → linear (safe). */
export function getEasing(name: string | undefined | null): EasingFn {
  return (name && EASING_FN[name]) || EASING_FN.linear;
}
