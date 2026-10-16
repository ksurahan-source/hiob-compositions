import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  authorOrganicTextLayout, validateOrganicTextLayout, verifyOrganicTextMetrics,
  organicTextBoundsAtFrame, ugcTextMotion, organicParentSignature, assertOrganicTextParent,
} from '../lib/organicText.mjs';

// Explicit deterministic test metrics; production callers must measure the loaded font.
const measureText = (text, size) => ({width: [...text].reduce((sum, c) => sum + (c === ' ' ? .3 : .85) * size, 0)});
const input = (patch = {}) => ({
  text: '실제 제품을 확인하세요', kind: 'caption', measureText, measurementId: 'test-font-metrics',
  font: {fontFamily: 'Black Han Sans', fontWeight: 400},
  safeArea: {left: 90, top: 270, right: 918, bottom: 1248},
  startMs: 1000, durationMs: 2000, fps: 30, fontSizes: [72], widths: [804],
  placements: [{y: 900}], ...patch,
});

test('authoring measures actual one/two line content and retains Korean words', () => {
  const short = authorOrganicTextLayout(input());
  const long = authorOrganicTextLayout(input({text: '수영하러 왔는데 수경만 씻고 있다고요?', widths: [700]}));
  assert.equal(short.lines.length, 1);
  assert.equal(long.lines.length, 2);
  assert.equal(long.lines.join(' ').replace(/\s+/gu, ' '), '수영하러 왔는데 수경만 씻고 있다고요?');
  assert.ok(long.height > short.height);
  assert.equal(short.layoutVersion, 'organic-v1');
  assert.ok(validateOrganicTextLayout(short, {text: input().text}).valid);
});

test('font measurement is mandatory and a missing fit never drops a word', () => {
  assert.throws(() => authorOrganicTextLayout(input({measureText: undefined})), {code: 'ORGANIC_TEXT_MEASUREMENT_REQUIRED'});
  assert.throws(() => authorOrganicTextLayout(input({text: '절대로삭제하면안되는길고긴하나의문자열', widths: [240]})), {code: 'ORGANIC_TEXT_NO_SAFE_FIT'});
  const style = authorOrganicTextLayout(input());
  assert.throws(() => validateOrganicTextLayout({...style, lines: ['다른 원문']}, {text: input().text}), {code: 'ORGANIC_TEXT_SOURCE_MISMATCH'});
  assert.throws(() => validateOrganicTextLayout(style, {text: input().text, startMs: 1001}), {code: 'ORGANIC_TEXT_TIMING_MISMATCH'});
});

test('semantic placement order stays stable across the entire moving protected window', () => {
  const style = authorOrganicTextLayout(input({
    placements: [{y: 900}, {y: 400}],
    protectedRegions: [{x: 90, y: 880, width: 828, height: 260, startMs: 1800, endMs: 2200, role: 'observed-product'}],
  }));
  assert.equal(style.y, 400);
  assert.equal(style.x, 102);
  assert.throws(() => validateOrganicTextLayout(style, {
    text: input().text,
    occupiedRegions: [{x: 90, y: 390, width: 828, height: 200, startMs: 1000, endMs: 3000}],
  }), {code: 'ORGANIC_TEXT_PROTECTED_OVERLAP'});
});

test('protected windows use the same rounded global frame clock as Remotion Sequence', () => {
  const style = authorOrganicTextLayout(input({startMs: 1020, placements: [{y: 900}]}));
  assert.throws(() => validateOrganicTextLayout(style, {text: input().text,
    protectedRegions: [{x: 90, y: 880, width: 828, height: 260, startMs: 1025, endMs: 1040}],
  }), {code: 'ORGANIC_TEXT_PROTECTED_OVERLAP'});
});

test('entrance, phrase pulse, stroke and shadow extrema remain inside the authored safe area', () => {
  const plain = authorOrganicTextLayout(input({placements: [{y: 282}]}));
  assert.throws(() => authorOrganicTextLayout(input({placements: [{y: 282}], entrance: 'slide-in'})), {code: 'ORGANIC_TEXT_NO_SAFE_FIT'});
  const pulse = authorOrganicTextLayout(input({placements: [{y: 700}], widths: [680], entrance: 'bounce', keywordMotion: 'pulse', emphasis: '제품'}));
  const frames = Array.from({length: 60}, (_, frame) => organicTextBoundsAtFrame(pulse, frame));
  assert.ok(frames.some(box => box.width > pulse.width));
  assert.ok(frames.every(box => box.left >= 90 && box.top >= 270 && box.right <= 918 && box.bottom <= 1248));
  assert.ok(organicTextBoundsAtFrame(plain, 0).bottom > plain.y + plain.height);
  const defaultWidths = authorOrganicTextLayout(input({widths: undefined, keywordMotion: 'pulse', emphasis: '제품'}));
  assert.ok(defaultWidths.width < 796);
  assert.ok(validateOrganicTextLayout(defaultWidths, {text: input().text}).valid);
});

test('actual font verification rejects stale widths and prepared line overflow', () => {
  const style = authorOrganicTextLayout(input());
  assert.equal(verifyOrganicTextMetrics(style, measureText).valid, true);
  assert.throws(() => verifyOrganicTextMetrics(style, (text, size) => measureText(text, size).width + 5), {code: 'ORGANIC_TEXT_FONT_METRICS_MISMATCH'});
  assert.throws(() => validateOrganicTextLayout({...style, lineWidths: [style.width + 1]}, {text: input().text}), {code: 'ORGANIC_TEXT_LINE_OVERFLOW'});
});

test('explicit transparent background is preserved and panel padding participates in bounds', () => {
  const clear = authorOrganicTextLayout(input({background: null}));
  const panel = authorOrganicTextLayout(input({background: {color: 'rgba(0,0,0,.7)', paddingX: 12, paddingY: 5, borderRadius: 4}, widths: [760]}));
  assert.equal(clear.background, null);
  assert.equal(panel.background.paddingX, 12);
  assert.ok(panel.bounds.width > panel.width);
});

test('caller supplied parent frame matrices include rotation/scale and require complete frames', () => {
  const parentFrames = Array.from({length: 60}, () => [1, 0, 0, 1, 10, 0]);
  const signature = organicParentSignature({transforms: {x: 0, y: 0, scale: 1, rotation: 0, opacity: 1}});
  const style = authorOrganicTextLayout(input({widths: [760], parentFrames, parentSignature: signature}));
  assert.ok(style.bounds.left >= style.x + 10 - 20);
  assert.equal(assertOrganicTextParent(style, {transforms: {x: 0, y: 0, scale: 1, rotation: 0, opacity: 1}}), true);
  assert.throws(() => assertOrganicTextParent(style, {transforms: {scale: 2}}), {code: 'ORGANIC_TEXT_PARENT_MISMATCH'});
  assert.throws(() => assertOrganicTextParent(authorOrganicTextLayout(input()), {effects: [{kind: 'zoom-in'}]}), {code: 'ORGANIC_TEXT_PARENT_UNSUPPORTED'});
  assert.throws(() => authorOrganicTextLayout(input({parentFrames: parentFrames.slice(1), parentSignature: signature})), {code: 'ORGANIC_TEXT_PARENT_FRAMES_INVALID'});
});

test('shared motion output stays identical to the legacy ugc-v3 evaluator', () => {
  const legacy = (entrance, keyword, frame, fps) => {
    const seconds = Math.max(0, frame) / Math.max(1, fps);
    const t = Math.min(1, seconds / .24);
    const eased = 1 - Math.pow(1 - t, 3);
    const container = {opacity: 1, transform: ''};
    if (entrance !== 'none') container.opacity = t;
    if (entrance === 'rise') container.transform = `translateY(${(1-eased)*40}px)`;
    if (entrance === 'slide-in') container.transform = `translateX(${(1-eased)*-60}px)`;
    if (entrance === 'pop') container.transform = `scale(${.8+.2*eased})`;
    if (entrance === 'bounce') container.transform = `scale(${1 - (1-t)*Math.cos(t*Math.PI*2)*.2})`;
    const emphasis = {display: 'inline-block', transform: ''};
    if (keyword === 'pulse') emphasis.transform = `scale(${1 + .035*Math.sin(seconds*Math.PI*4)})`;
    if (keyword === 'wave') emphasis.transform = `translateY(${3*Math.sin(seconds*Math.PI*3)}px)`;
    if (keyword === 'glitch' && frame % 18 < 2) emphasis.transform = `translateX(${frame % 2 ? -2 : 2}px)`;
    return {container, emphasis};
  };
  for (const entrance of ['none', 'fade-in', 'rise', 'pop', 'bounce', 'slide-in']) {
    for (const keyword of ['none', 'pulse', 'wave', 'glitch']) {
      for (const frame of [0, 1, 4, 8, 19, 31]) assert.deepEqual(ugcTextMotion(entrance, keyword, frame, 30), legacy(entrance, keyword, frame, 30));
    }
  }
});
