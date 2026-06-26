/**
 * Unit tests for BK-04: brand variable resolver.
 * Run: node --experimental-strip-types packages/compositions/src/__tests__/brandVarResolver.test.ts
 */
import { resolveBrandVar } from '../lib/brandVarResolver.ts';
import type { BrandKit } from '@hiob/timeline/schema';

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

const KIT: BrandKit = {
  id: 'kit-001',
  name: 'ViewOK',
  colors: { accent: '#ff0000', primary: '#0066cc', secondary: '#00cc66' },
  fonts: {
    body: { family: 'Pretendard', weights: ['400', '700'], fallback: 'sans-serif', italic: false },
    heading: { family: 'Black Han Sans', weights: ['400'], fallback: 'sans-serif', italic: false },
  },
};

// ── 1. Pass-through (not a brand ref) ────────────────────────────────────────
console.log('\n1. Pass-through (literal values)');
{
  assert('hex color passes through', resolveBrandVar('#ff7a00', 'color', KIT) === '#ff7a00');
  assert('hex color passes through (no kit)', resolveBrandVar('#abcdef', 'color', undefined) === '#abcdef');
  assert('font name passes through', resolveBrandVar('Inter', 'font', KIT) === 'Inter');
  assert('font name passes through (no kit)', resolveBrandVar('Georgia', 'font', undefined) === 'Georgia');
}

// ── 2. Brand color resolution ────────────────────────────────────────────────
console.log('\n2. Brand color resolution');
{
  assert('resolves accent color', resolveBrandVar('{{brand.colors.accent}}', 'color', KIT) === '#ff0000');
  assert('resolves primary color', resolveBrandVar('{{brand.colors.primary}}', 'color', KIT) === '#0066cc');
  assert('resolves secondary color', resolveBrandVar('{{brand.colors.secondary}}', 'color', KIT) === '#00cc66');
}

// ── 3. Brand font resolution ─────────────────────────────────────────────────
console.log('\n3. Brand font resolution');
{
  assert('resolves body font', resolveBrandVar('{{brand.fonts.body}}', 'font', KIT) === 'Pretendard');
  assert('resolves heading font', resolveBrandVar('{{brand.fonts.heading}}', 'font', KIT) === 'Black Han Sans');
}

// ── 4. Fallback when kit is missing ─────────────────────────────────────────
console.log('\n4. Fallback — no kit');
{
  assert('color fallback is #000000', resolveBrandVar('{{brand.colors.accent}}', 'color', undefined) === '#000000');
  assert('font fallback is sans-serif', resolveBrandVar('{{brand.fonts.body}}', 'font', undefined) === 'sans-serif');
}

// ── 5. Fallback when key is missing from kit ─────────────────────────────────
console.log('\n5. Fallback — missing key in kit');
{
  assert('missing color key → #000000', resolveBrandVar('{{brand.colors.nonexistent}}', 'color', KIT) === '#000000');
  assert('missing font key → sans-serif', resolveBrandVar('{{brand.fonts.nonexistent}}', 'font', KIT) === 'sans-serif');
}

// ── 6. Malformed brand refs ──────────────────────────────────────────────────
console.log('\n6. Malformed refs (graceful fallback)');
{
  assert('malformed ref → color default', resolveBrandVar('{{brand.colors}}', 'color', KIT) === '#000000');
  assert('wrong namespace color→font → font default', resolveBrandVar('{{brand.fonts.body}}', 'color', KIT) === '#000000');
  assert('wrong namespace font→color → color default', resolveBrandVar('{{brand.colors.accent}}', 'font', KIT) === 'sans-serif');
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n✅ Passed: ${passed}  ❌ Failed: ${failed}`);
if (failed > 0) process.exit(1);
