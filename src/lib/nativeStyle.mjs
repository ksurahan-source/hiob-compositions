import {validateOrganicTextLayout} from './organicText.mjs';

export const NATIVE_STYLE_CONTRACT = 'native-style-v1';
export const NATIVE_STYLE_IDS = Object.freeze(['reaction', 'comic', 'narrative']);
export const NATIVE_SHAPE_PRESETS = Object.freeze(['stamp', 'comic-frame', 'halftone', 'ink', 'rule', 'paper', 'tape', 'scanline', 'glitch-bars', 'sparkle', 'grid', 'arrow']);
const fail = (message, code = 'NATIVE_STYLE_INVALID') => {throw Object.assign(new Error(`${code}: ${message}`), {code});};
const finite = n => typeof n === 'number' && Number.isFinite(n);
const range = (n, min, max, integer = false) => finite(n) && n >= min && n <= max && (!integer || Number.isInteger(n));
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function keys(value, required, optional = []) {
  if (!object(value) || required.some(k => !(k in value)) || Object.keys(value).some(k => !required.includes(k) && !optional.includes(k))) fail(`Expected only ${[...required, ...optional].join(', ')}.`);
}
const id = s => typeof s === 'string' && s.length > 0 && s.length <= 100 && !/[\u0000-\u001f]/u.test(s);
const start = c => c.startMs ?? c.start_ms;
const duration = c => c.durationMs ?? c.duration_ms;
const text = c => c.textContent ?? c.text_content ?? '';
const kind = (c, tracks) => c.trackKind ?? c.track_kind ?? tracks?.find(t => t.id === c.track_id)?.kind;
const frameWindow = (at, length, fps) => ({from:Math.round(at/1000*fps), length:Math.max(1,Math.round(length/1000*fps))});
const containsFrames = (outer, inner) => inner.from >= outer.from && inner.from + inner.length <= outer.from + outer.length;
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const inside = (a, b) => a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom;
function paintColor(value) {
  if (typeof value !== 'string') return false;
  if (value === 'transparent' || /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/iu.test(value)) return true;
  const rgb = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/u.exec(value);
  return !!rgb && rgb.slice(1,4).every(n=>Number(n)<=255) && (value.startsWith('rgba(') ? rgb[4]!==undefined && Number(rgb[4])<=1 : rgb[4]===undefined);
}
function rect(value) {
  keys(value, ['left', 'top', 'right', 'bottom']);
  if (Object.values(value).some(n => !finite(n)) || value.left >= value.right || value.top >= value.bottom) fail('A finite positive rectangle is required.');
  return value;
}
function region(value) {
  keys(value, ['x', 'y', 'width', 'height', 'startMs', 'endMs'], ['id', 'role']);
  if (!finite(value.x) || !finite(value.y) || !finite(value.width) || !finite(value.height) || value.width <= 0 || value.height <= 0 ||
    !range(value.startMs, 0, Number.MAX_SAFE_INTEGER, true) || !range(value.endMs, value.startMs + 1, Number.MAX_SAFE_INTEGER, true) ||
    (value.id !== undefined && !id(value.id)) || (value.role !== undefined && !id(value.role))) fail('Protected regions require finite geometry and absolute integer time windows.');
  return {left: value.x, top: value.y, right: value.x + value.width, bottom: value.y + value.height};
}

/** Conservative visible support. A hollow frame protects its interior at every frame. */
export function nativeShapeBounds(layer, width = 1080, height = 1920) {
  const r = layer.rect;
  const box = {left: r.x * width, top: r.y * height, right: (r.x + r.width) * width, bottom: (r.y + r.height) * height};
  if (layer.preset !== 'comic-frame') return [box];
  const s = Math.min(layer.strokeWidth, r.width * width / 2, r.height * height / 2);
  if (s === 0) return [];
  return [{...box, bottom: box.top + s}, {...box, top: box.bottom - s},
    {...box, top: box.top + s, bottom: box.bottom - s, right: box.left + s},
    {...box, top: box.top + s, bottom: box.bottom - s, left: box.right - s}];
}

export function nativeLayerMotion(layer, frame, fps) {
  const ms = frame / fps * 1000;
  const motion = layer.motion;
  const progress = !motion || motion.entrance === 'none' ? 1 : Math.min(1, Math.max(0, ms / motion.entranceMs));
  const eased = 1 - (1 - progress) ** 3;
  const exit = motion?.exit === 'fade' ? Math.min(1, Math.max(0, (layer.endMs - layer.startMs - ms) / motion.exitMs)) : 1;
  return {opacity: layer.opacity * (motion ? progress : 1) * exit,
    // Frames retain static border supports; their interior never sweeps across a face.
    scale: motion?.entrance === 'stamp' && layer.preset !== 'comic-frame' ? .68 + .32 * eased : 1,
    translateX: motion?.entrance === 'slide' && layer.preset !== 'comic-frame' ? (1 - eased) * -.15 : 0,
    reveal: motion?.entrance === 'wipe' ? eased : 1};
}

/** The same strict authoring contract is consumed by Studio/MCP and the shared renderer. */
export function validateNativeStyle(value, context = {}) {
  keys(value, ['contract', 'styleId', 'version', 'observationId', 'safeArea', 'protectedRegions', 'layers']);
  const {clip, clips = [], tracks = [], width = 1080, height = 1920, fps = 30} = context;
  if (value.contract !== NATIVE_STYLE_CONTRACT || value.version !== 1 || !NATIVE_STYLE_IDS.includes(value.styleId) || typeof value.observationId !== 'string' || !value.observationId.trim() || value.observationId.length > 200 || /[\u0000-\u001f]/u.test(value.observationId) ||
    !range(width, 1, 16384) || !range(height, 1, 16384) || !range(fps, 1, 120) || !clip ||
    !range(start(clip), 0, Number.MAX_SAFE_INTEGER, true) || !range(duration(clip), 1, 1200000, true)) fail('Contract, observation, canvas and owner clock are required.');
  const safe = rect(value.safeArea);
  if (!inside(safe, {left: 0, top: 0, right: width, bottom: height})) fail('Safe area exceeds the canvas.');
  if (!Array.isArray(value.protectedRegions) || value.protectedRegions.length > 100) fail('At most 100 observed protection windows are supported.');
  const protectedBoxes = value.protectedRegions.map(region);
  if (!Array.isArray(value.layers) || value.layers.length < 1 || value.layers.length > 16) fail('One to sixteen authored layers are required.');
  // Existing primary text remains authoritative. New reaction graphics may not
  // cover it; intentional overlap among the new grouped layers is allowed.
  const hiddenTracks = new Set(tracks.filter(t => t.visible === false).map(t => t.id));
  const visible = c => !hiddenTracks.has(c.track_id);
  const sharesFrames = (a, b) => a.from < b.from + b.length && a.from + a.length > b.from;
  const primary = clips.filter(c => visible(c) && ['caption','title'].includes(kind(c,tracks)) && text(c).trim() &&
    value.layers.some(layer => sharesFrames(frameWindow(start(c),duration(c),fps),frameWindow(start(clip)+layer.startMs,layer.endMs-layer.startMs,fps))));
  if (primary.some(c => !['organic-v1','organic-v2'].includes(c.attributes?.text_style?.layoutVersion)))
    fail('Every simultaneously displayed primary caption/title needs measured bounds.', 'NATIVE_STYLE_OCCUPIED_UNMEASURED');
  const occupiedRegions = primary.map(c => {
    const checked = validateOrganicTextLayout(c.attributes.text_style, {text:text(c), startMs:start(c), durationMs:duration(c), fps});
    const b = checked.bounds;
    return {x:b.left,y:b.top,width:b.width,height:b.height,startMs:Math.round(start(c)/1000*fps)/fps*1000,
      endMs:(Math.round(start(c)/1000*fps)+Math.max(1,Math.round(duration(c)/1000*fps)))/fps*1000};
  });
  const ids = new Set(), sources = new Set();
  for (const layer of value.layers) {
    const common = ['id', 'kind', 'startMs', 'endMs', 'zIndex', 'opacity'];
    keys(layer, [...common, ...(layer.kind === 'shape' ? ['preset', 'rect', 'colors', 'strokeWidth', 'motion'] : ['sourceClipId', 'sourceText', 'textStyle', 'mask'])]);
    if (!id(layer.id) || ids.has(layer.id) || !['shape', 'text'].includes(layer.kind) || !range(layer.zIndex, 0, 100, true) || !range(layer.opacity, 0, 1) ||
      !range(layer.startMs, 0, duration(clip) - 1, true) || !range(layer.endMs, layer.startMs + 1, duration(clip), true)) fail('Layer id, time, opacity or order is invalid.');
    ids.add(layer.id);
    const window = frameWindow(start(clip)+layer.startMs,layer.endMs-layer.startMs,fps);
    if (!containsFrames(frameWindow(start(clip),duration(clip),fps),window)) fail('Rounded layer frames exceed the original owner clock.');
    if (layer.kind === 'shape') {
      keys(layer.rect, ['x', 'y', 'width', 'height']);
      const r = layer.rect, m = layer.motion;
      if (!NATIVE_SHAPE_PRESETS.includes(layer.preset) || !range(r.x, 0, 1) || !range(r.y, 0, 1) || !range(r.width, Number.EPSILON, 1) || !range(r.height, Number.EPSILON, 1) || r.x + r.width > 1 || r.y + r.height > 1 ||
        !Array.isArray(layer.colors) || layer.colors.length !== 2 || layer.colors.some(c => typeof c !== 'string' || !/^#[\da-f]{6}$/iu.test(c)) || !range(layer.strokeWidth, 0, 16)) fail('Unsupported shape, paint or normalized geometry.');
      keys(m, ['entrance', 'entranceMs', 'exit', 'exitMs']);
      if (!['none', 'stamp', 'wipe', 'slide'].includes(m.entrance) || !['none', 'fade'].includes(m.exit) || !range(m.entranceMs, 0, 800, true) || !range(m.exitMs, 0, 500, true) ||
        (m.entrance === 'none') !== (m.entranceMs === 0) || (m.exit === 'none') !== (m.exitMs === 0) || m.entranceMs + m.exitMs > layer.endMs - layer.startMs) fail('Motion must fit the authored layer window.');
      const supports = nativeShapeBounds(layer, width, height);
      if (supports.some(b => !inside(b, safe))) fail('Shape crosses the safe area.', 'NATIVE_STYLE_UNSAFE');
      const firstFrame = Math.round((start(clip) + layer.startMs) / 1000 * fps);
      const frames = Math.max(1, Math.round((layer.endMs - layer.startMs) / 1000 * fps));
      const activeWindow = p => {
        const begin = Math.ceil(p.startMs/1000*fps), end = Math.ceil(p.endMs/1000*fps);
        return begin < end && firstFrame < end && firstFrame + frames > begin;
      };
      if (value.protectedRegions.some((p, i) => activeWindow(p) && supports.some(b => overlaps(b, protectedBoxes[i])))) fail('Shape overlaps observed content.', 'NATIVE_STYLE_PROTECTED_OVERLAP');
      if (occupiedRegions.some(p => activeWindow(p) && supports.some(b => overlaps(b, {left:p.x,top:p.y,right:p.x+p.width,bottom:p.y+p.height})))) fail('Shape overlaps existing primary text.', 'NATIVE_STYLE_TEXT_OVERLAP');
    } else {
      const source = clips.find(c => c.id === layer.sourceClipId);
      const absoluteStart = start(clip) + layer.startMs;
      const wholeLine = source && ['organic-v1','organic-v2'].includes(source.attributes?.text_style?.layoutVersion) && source.attributes.text_style.lines?.includes(layer.sourceText);
      const crossOwnerSplit = clips.some(c => c.id !== clip.id && c.attributes?.native_style?.layers?.some(other =>
        other.kind === 'text' && other.sourceClipId === layer.sourceClipId && other.sourceText !== layer.sourceText));
      if (!id(layer.sourceClipId) || !source || !visible(source) || !['caption', 'title'].includes(kind(source, tracks)) || typeof layer.sourceText !== 'string' || !layer.sourceText.trim() ||
        !(layer.sourceText === text(source) || wholeLine) || sources.has(layer.sourceClipId) || crossOwnerSplit ||
        absoluteStart < start(source) || start(clip) + layer.endMs > start(source) + duration(source) || !containsFrames(frameWindow(start(source),duration(source),fps),window) ||
        !['none', 'block-reveal'].includes(layer.mask)) fail('Use one complete original phrase or measured line per source; word/line splitting across layers or owners is forbidden.', 'NATIVE_STYLE_SOURCE_MISMATCH');
      sources.add(layer.sourceClipId);
      const style = layer.textStyle;
      if (!object(style) || style.layoutVersion !== 'organic-v2' || style.parentFrames !== undefined || style.parentSignature !== undefined ||
        !object(style.safeArea) || ['left', 'top', 'right', 'bottom'].some(k => style.safeArea[k] !== safe[k])) fail('Text requires measured organic-v2 geometry in the same safe area.');
      keys(style, ['layoutVersion','motion','palette','emphasisSpans','x','y','width','height','fontSize','lineHeight','fontFamily','fontWeight','letterSpacing',
        'lines','lineWidths','measurementId','safeArea','startMs','durationMs','fps','entrance','keywordMotion','emphasis','variant','background','strokeWidth','strokeColor','shadow'], ['fill','bounds']);
      if (!paintColor(style.strokeColor) || !paintColor(style.shadow?.color) || (style.background!==null && !paintColor(style.background?.color))) fail('Text paint must be a literal color without external CSS resources.');
      validateOrganicTextLayout(style, {text: layer.sourceText, startMs: absoluteStart, durationMs: layer.endMs - layer.startMs, fps,
        protectedRegions: value.protectedRegions, occupiedRegions});
    }
  }
  return {valid: true, layers: value.layers.length, contract: NATIVE_STYLE_CONTRACT};
}
