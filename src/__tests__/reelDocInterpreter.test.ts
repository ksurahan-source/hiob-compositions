/**
 * Unit tests for ENG-04: Pure Interpreter — ReelDocCanvas architecture.
 *
 * Tests focus on the pure, non-React units that can be exercised in Node.js
 * without a Remotion render context:
 *   - AnimationRegistry: preset lookup, registration, determinism
 *   - ElementRendererRegistry: type dispatch
 *   - evaluateKfProperty / applyAnimations: keyframe interpolation math
 *   - Fixture validation: MINIMAL_REEL_DOC validates against ReelDocSchema
 *
 * Run: node --experimental-strip-types packages/compositions/src/__tests__/reelDocInterpreter.test.ts
 */
import { AnimationRegistry, defaultAnimationRegistry } from '../lib/animationRegistry.ts';
import {
  ElementRendererRegistry,
  evaluateKfProperty,
  applyAnimations,
} from '../lib/elementRenderers/index.ts';
import { validateReelDoc } from '@hiob/timeline/schema';
import { MINIMAL_REEL_DOC, ANIMATED_REEL_DOC } from '../__fixtures__/minimalReelDoc.fixture.ts';

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

function assertClose(label: string, actual: number, expected: number, tolerance = 0.01): void {
  assert(`${label} (got ${actual.toFixed(4)}, want ~${expected})`, Math.abs(actual - expected) <= tolerance);
}

// ── 1. AnimationRegistry: built-in presets ────────────────────────────────────
console.log('\n1. AnimationRegistry — built-in presets');
{
  const presets = defaultAnimationRegistry.listPresets();
  assert('≥8 built-in presets', presets.length >= 8);
  assert('has ken-burns-left', presets.includes('ken-burns-left'));
  assert('has ken-burns-right', presets.includes('ken-burns-right'));
  assert('has ken-burns-up', presets.includes('ken-burns-up'));
  assert('has ken-burns-down', presets.includes('ken-burns-down'));
  assert('has fade-in', presets.includes('fade-in'));
  assert('has fade-out', presets.includes('fade-out'));
  assert('has scale-in', presets.includes('scale-in'));
  assert('has slide-in-left', presets.includes('slide-in-left'));
  assert('has punch-in', presets.includes('punch-in'));
  assert('has subshot-drift', presets.includes('subshot-drift'));
}

// ── 2. AnimationRegistry: getPreset returns a function ───────────────────────
console.log('\n2. AnimationRegistry — getPreset');
{
  const fn = defaultAnimationRegistry.getPreset('ken-burns-left');
  assert('getPreset returns a function', typeof fn === 'function');
  assert('getPreset(nonexistent) returns null', defaultAnimationRegistry.getPreset('nonexistent-xyz') === null);

  if (fn) {
    const startTransform = fn(0, 30, 90);
    const endTransform = fn(90, 30, 90);
    assert('start frame has scale', typeof startTransform.scale === 'number');
    assert('start frame has x', typeof startTransform.x === 'number');
    assert('start scale < end scale', (startTransform.scale ?? 0) < (endTransform.scale ?? 1));
    assertClose('start x ≈ -1.8', startTransform.x ?? 0, -1.8, 0.05);
    assertClose('end x ≈ 1.8', endTransform.x ?? 0, 1.8, 0.05);
  }
}

// ── 3. AnimationRegistry: custom registration ────────────────────────────────
console.log('\n3. AnimationRegistry — registerPreset');
{
  const registry = new AnimationRegistry();
  assert('custom registry starts empty (no custom-test)', registry.getPreset('custom-test') === null);
  registry.registerPreset('custom-test', (frame, fps, dur) => ({ opacity: frame / dur }));
  assert('after register, custom-test exists', registry.getPreset('custom-test') !== null);
  const fn = registry.getPreset('custom-test')!;
  assertClose('custom fn at frame=0 opacity=0', fn(0, 30, 30).opacity ?? -1, 0);
  assertClose('custom fn at frame=15 opacity=0.5', fn(15, 30, 30).opacity ?? -1, 0.5, 0.01);
  assertClose('custom fn at frame=30 opacity=1', fn(30, 30, 30).opacity ?? -1, 1.0, 0.01);
}

// ── 4. fade-in preset is deterministic ───────────────────────────────────────
console.log('\n4. AnimationRegistry — fade-in determinism');
{
  const fadeIn = defaultAnimationRegistry.getPreset('fade-in')!;
  assertClose('fade-in at 0 = opacity 0', fadeIn(0, 30, 30).opacity ?? -1, 0);
  assertClose('fade-in at 15 = opacity ~0.5', fadeIn(15, 30, 30).opacity ?? -1, 0.5, 0.05);
  assertClose('fade-in at 30 = opacity 1', fadeIn(30, 30, 30).opacity ?? -1, 1.0);
}

// ── 5. evaluateKfProperty ─────────────────────────────────────────────────────
console.log('\n5. evaluateKfProperty — keyframe interpolation');
{
  const kfs = [
    { time: 0, opacity: 0 },
    { time: 100, opacity: 1 },
  ];
  assertClose('at 0% = 0', evaluateKfProperty(kfs, 0, 'opacity') ?? -1, 0);
  assertClose('at 50% = 0.5', evaluateKfProperty(kfs, 50, 'opacity') ?? -1, 0.5, 0.02);
  assertClose('at 100% = 1', evaluateKfProperty(kfs, 100, 'opacity') ?? -1, 1.0);
  assert('missing property = undefined', evaluateKfProperty(kfs, 50, 'scale') === undefined);
  assert('empty keyframes = undefined', evaluateKfProperty([], 50, 'opacity') === undefined);
}

// Multi-segment keyframes
{
  const kfs = [
    { time: 0, x: 0 },
    { time: 50, x: 50 },
    { time: 100, x: 0 },
  ];
  assertClose('multi-seg at 25% = 25', evaluateKfProperty(kfs, 25, 'x') ?? -1, 25, 1);
  assertClose('multi-seg at 75% = 25', evaluateKfProperty(kfs, 75, 'x') ?? -1, 25, 1);
  assertClose('multi-seg at 50% = 50', evaluateKfProperty(kfs, 50, 'x') ?? -1, 50, 1);
}

// ── 6. applyAnimations ────────────────────────────────────────────────────────
console.log('\n6. applyAnimations — property animation');
{
  const el = {
    id: 'test-el',
    type: 'video' as const,
    src: 'https://example.com/test.mp4',
    x: 0, y: 0, width: 100, height: 100, opacity: 1, zIndex: 0,
    scale: 1, rotation: 0, loop: false, muted: false, startFrom: 0, volume: 1,
    fit: 'cover' as const, duration: 1000,
    animations: [
      {
        type: 'property' as const,
        startTime: 0,
        duration: 1000,
        easing: 'ease-out' as const,
        keyframes: [
          { time: 0, opacity: 0 },
          { time: 100, opacity: 1 },
        ],
      },
    ],
  };

  const fps = 30;
  const registry = defaultAnimationRegistry;

  // Frame 0 = start of animation → opacity = 0
  const t0 = applyAnimations(el, 0, fps, registry);
  assertClose('applyAnimations: frame 0 opacity = 0', t0.opacity ?? -1, 0, 0.02);

  // Frame 15 = halfway through 1s animation at 30fps → opacity ≈ 0.5
  const t15 = applyAnimations(el, 15, fps, registry);
  assert('applyAnimations: frame 15 has opacity', t15.opacity !== undefined);

  // Frame 30 = end of 1s animation at 30fps → opacity = 1
  const t30 = applyAnimations(el, 30, fps, registry);
  assertClose('applyAnimations: frame 30 opacity = 1', t30.opacity ?? -1, 1.0, 0.02);

  // Frame 60 = outside animation window → no transform applied
  const t60 = applyAnimations(el, 60, fps, registry);
  assert('applyAnimations: frame outside window returns empty', t60.opacity === undefined);
}

// ── 7. ElementRendererRegistry: registration + dispatch ──────────────────────
console.log('\n7. ElementRendererRegistry — type dispatch');
{
  const registry = new ElementRendererRegistry();
  assert('get unregistered type = null', registry.get('video') === null);
  const mockFn = () => null;
  registry.register('video', mockFn as any);
  assert('get registered type = function', registry.get('video') === mockFn);
  registry.register('text', mockFn as any);
  assert('get text = function', registry.get('text') === mockFn);
}

// ── 8. Fixture validation ─────────────────────────────────────────────────────
console.log('\n8. Fixture validation against ReelDocSchema');
{
  const result = validateReelDoc(MINIMAL_REEL_DOC);
  assert('MINIMAL_REEL_DOC validates', result.ok === true);
  if (result.ok) {
    assert('version = 1.0', result.doc.version === '1.0');
    assert('has 2 elements', result.doc.elements.length === 2);
    assert('first element is video', result.doc.elements[0].type === 'video');
    assert('second element is audio', result.doc.elements[1].type === 'audio');
  }
}

{
  const result = validateReelDoc(ANIMATED_REEL_DOC);
  assert('ANIMATED_REEL_DOC validates', result.ok === true);
  if (result.ok) {
    const vid = result.doc.elements[0];
    assert('animated video has animations', vid.type === 'video' && (vid as any).animations.length === 1);
  }
}

{
  const invalid: unknown = { id: 'not-uuid', version: '1.0', title: 'x', outputFormat: {}, elements: [] };
  const result = validateReelDoc(invalid);
  assert('invalid doc fails validation', result.ok === false);
  if (!result.ok) {
    assert('errors array is non-empty', result.errors.length > 0);
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n──────────────────────────────────────────────────`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
