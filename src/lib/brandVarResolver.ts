/**
 * Brand variable resolution — pure, deterministic, zero side-effects.
 *
 * Resolves {{brand.colors.accent}} / {{brand.fonts.body.family}} to actual values
 * from the supplied BrandKit.  Falls back to hardcoded defaults when the kit is
 * absent or the key is missing — never throws, never crashes the renderer.
 */
import type { BrandKit } from '@hiob/timeline/schema';

const BRAND_VAR_RE = /^\{\{brand\.([a-zA-Z0-9_]+)\.([a-zA-Z0-9_.]+)\}\}$/;

const DEFAULTS = {
  color: '#000000',
  font: 'sans-serif',
} as const;

/**
 * Resolve a brand variable reference to its concrete value.
 *
 * @param ref   Raw value from a ReelDoc element property.
 *              If it does not start with `{{brand.`, returned as-is.
 * @param type  `'color'` → resolves from brandKit.colors;
 *              `'font'`  → resolves fontFamily from brandKit.fonts.
 * @param brandKit Optional kit; absent → DEFAULTS.
 */
export function resolveBrandVar(
  ref: string,
  type: 'color' | 'font',
  brandKit: BrandKit | undefined,
): string {
  if (!ref.startsWith('{{brand.')) return ref;

  const m = ref.match(BRAND_VAR_RE);
  if (!m) return DEFAULTS[type];

  const [, ns, key] = m;

  if (ns === 'colors' && type === 'color') {
    const val = brandKit?.colors?.[key];
    return typeof val === 'string' ? val : DEFAULTS.color;
  }

  if (ns === 'fonts' && type === 'font') {
    const val = brandKit?.fonts?.[key]?.family;
    return typeof val === 'string' ? val : DEFAULTS.font;
  }

  return DEFAULTS[type];
}
