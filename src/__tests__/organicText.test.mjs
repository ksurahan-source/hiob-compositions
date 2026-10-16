import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  authorOrganicTextLayout, validateOrganicTextLayout, verifyOrganicTextMetrics,
  organicTextBoundsAtFrame, organicTextMotionGeometry, organicTextMotion, organicEmphasisState, ugcTextMotion, organicParentSignature, assertOrganicTextParent,
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

const v2input = patch => input({layoutVersion:'organic-v2',fontSizes:[56],widths:[560],placements:[{y:700}],entrance:'pop',
  motion:{entranceMs:400,intensity:.8,settle:.18,exit:'rise-out',exitMs:250},
  palette:{base:'#FFFFFF',accent:'#FFD65C',contrast:'#8EE6CE',alert:'#FF6B82'},
  semanticSpans:[{text:'제품',startMs:500,endMs:1400,color:'accent',motion:'pulse',intensity:1}],...patch});
test('v2 timed semantic color and motion retain the complete phrase and exact source clock',()=>{
 const source=v2input(), {measureText: ignored, ...serializable}=source, before=structuredClone(serializable);
 const style=authorOrganicTextLayout(source);
 assert.equal(style.layoutVersion,'organic-v2');assert.deepEqual(style.lines,['실제 제품을 확인하세요']);
 assert.deepEqual(style.emphasisSpans[0],{line:0,start:3,end:5,text:'제품',startMs:500,endMs:1400,color:'accent',motion:'pulse',intensity:1});
 assert.equal(organicEmphasisState(style,style.emphasisSpans[0],0).color,'#FFFFFF');
 assert.equal(organicEmphasisState(style,style.emphasisSpans[0],25).color,'#FFD65C');
 assert.ok(organicEmphasisState(style,style.emphasisSpans[0],25).scale>1.1);
 assert.equal(organicEmphasisState(style,style.emphasisSpans[0],45).scale,1);
 assert.equal(organicTextMotionGeometry(style,0).scale,.76);
 assert.equal(organicTextMotionGeometry(style,12).scale,1);
 assert.ok(organicTextMotionGeometry(style,59).opacity<.2);
 assert.ok(organicTextMotionGeometry(style,59).y<0);
 const {measureText: ignoredAfter, ...after}=source;assert.deepEqual(after,before);
 assert.equal(validateOrganicTextLayout(style,{text:source.text,startMs:1000,durationMs:2000}).valid,true);
});
test('v2 validates maximum semantic excursion against protected content and does not silently shrink motion',()=>{
 const plain=authorOrganicTextLayout(v2input({semanticSpans:[]}));
 const animated=authorOrganicTextLayout(v2input());
 assert.ok(animated.bounds.width>plain.bounds.width);
 const region={x:plain.bounds.right+2,y:700,width:4,height:80};
 assert.throws(()=>authorOrganicTextLayout(v2input({protectedRegions:[region]})),{code:'ORGANIC_TEXT_NO_SAFE_FIT'});
 assert.ok(Array.from({length:60},(_,frame)=>organicTextBoundsAtFrame(animated,frame)).every(b=>b.left>=90&&b.right<=918&&b.top>=270&&b.bottom<=1248));
});
test('v2 rejects ambiguous, overlapping, modified or out-of-time semantic phrases and injected fill',()=>{
 assert.throws(()=>authorOrganicTextLayout(v2input({text:'제품 제품',semanticSpans:[{text:'제품',startMs:0,endMs:1000,color:'accent',motion:'none',intensity:1}]})),{code:'ORGANIC_TEXT_NO_SAFE_FIT'});
 for(const patch of [{endMs:2001},{startMs:1400,endMs:500},{color:'url(https://bad)'},{intensity:2}]) {
  const original=v2input();assert.throws(()=>authorOrganicTextLayout(v2input({semanticSpans:[{...original.semanticSpans[0],...patch}]})),{code:'ORGANIC_TEXT_EMPHASIS_INVALID'});
 }
 const original=v2input();assert.throws(()=>authorOrganicTextLayout(v2input({semanticSpans:[original.semanticSpans[0],{...original.semanticSpans[0]}]})),{code:'ORGANIC_TEXT_EMPHASIS_INVALID'});
 assert.throws(()=>authorOrganicTextLayout(v2input({fill:{kind:'linear',angle:90,colors:['#FFFFFF','url(https://bad)']}})),{code:'ORGANIC_TEXT_LAYOUT_INVALID'});
 assert.throws(()=>authorOrganicTextLayout(v2input({motion:{...v2input().motion,exitMs:1900}})),{code:'ORGANIC_TEXT_LAYOUT_INVALID'});
 const style=authorOrganicTextLayout(v2input());assert.throws(()=>validateOrganicTextLayout({...style,emphasisSpans:[{...style.emphasisSpans[0],text:'변조'}]}),{code:'ORGANIC_TEXT_EMPHASIS_INVALID'});
});
test('v2 palette/fill only change paint while fonts, line metrics and v1 evaluator remain stable',()=>{
 const a=authorOrganicTextLayout(v2input());
 const b=authorOrganicTextLayout(v2input({fill:{kind:'linear',angle:90,colors:['#FFFFFF','#FFD65C']}}));
 assert.deepEqual(a.bounds,b.bounds);assert.deepEqual(a.lineWidths,b.lineWidths);
 const v1=authorOrganicTextLayout(input());for(const frame of [0,1,7,18,59]) assert.deepEqual(organicTextMotion(v1,frame),ugcTextMotion(v1.entrance,v1.keywordMotion,frame,v1.fps));
 assert.throws(()=>validateOrganicTextLayout({...v1,motion:v2input().motion}),{code:'ORGANIC_TEXT_LAYOUT_INVALID'});
});

test('v2 font measurements follow the rendered inline chunks instead of assuming cross-span kerning',()=>{
 const measure=(text,size)=>({width:[...text].length*size*.5-(text.includes('AV')?12:0)});
 const style=authorOrganicTextLayout(v2input({text:'AV 제품',measureText:measure,semanticSpans:[{text:'V',startMs:0,endMs:1000,color:'accent',motion:'none',intensity:0}]}));
 assert.equal(style.lineWidths[0],measure('A',56).width+measure('V',56).width+measure(' 제품',56).width);
 assert.notEqual(style.lineWidths[0],measure('AV 제품',56).width);
 assert.equal(verifyOrganicTextMetrics(style,measure).valid,true);
});

test('v2 preferred line groups reflow awkward source newlines without rewriting any token',()=>{
 const text='왔다! 그런데 첫\n상대가 하필 이';
 const style=authorOrganicTextLayout(v2input({text,fontSizes:[40],lineGroups:['왔다! 그런데','첫 상대가 하필 이'],semanticSpans:[]}));
 assert.deepEqual(style.lines,['왔다! 그런데','첫 상대가 하필 이']);assert.equal(validateOrganicTextLayout(style,{text}).valid,true);
 assert.equal(verifyOrganicTextMetrics(style,measureText).valid,true);
 assert.throws(()=>authorOrganicTextLayout(v2input({text,lineGroups:['왔다! 다른','첫 상대가 하필 이'],semanticSpans:[]})),{code:'ORGANIC_TEXT_SOURCE_MISMATCH'});
 assert.throws(()=>authorOrganicTextLayout(input({lineGroups:['실제 제품을 확인하세요']})),{code:'ORGANIC_TEXT_SOURCE_MISMATCH'});
 assert.throws(()=>authorOrganicTextLayout(v2input({text,lineGroups:['왔다! 그런데 첫 상대가 하필 이'],fontSizes:[160],semanticSpans:[]})),{code:'ORGANIC_TEXT_NO_SAFE_FIT'});
});
