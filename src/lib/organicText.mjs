/** Pure authoring/verification shared by Studio and the render composition. No DOM or font guesses. */
export const ORGANIC_TEXT_PROFILE = 'organic-v1';
export const ORGANIC_FONT_DESCRIPTORS = Object.freeze({
  'Black Han Sans': Object.freeze({fontFamily: 'Black Han Sans', fontWeight: 400, googleFontModule: '@remotion/google-fonts/BlackHanSans'}),
  'Noto Sans KR': Object.freeze({fontFamily: 'Noto Sans KR', fontWeight: 500, googleFontModule: '@remotion/google-fonts/NotoSansKR'}),
});
const ENTRANCES = ['none', 'fade-in', 'rise', 'pop', 'bounce', 'slide-in'];
const KEYWORD_MOTIONS = ['none', 'pulse', 'wave', 'glitch'];
const normalize = text => String(text).trim().replace(/\s+/gu, ' ');
const finite = value => typeof value === 'number' && Number.isFinite(value);
const fail = (code, message) => { throw Object.assign(new Error(`${code}: ${message}`), {code}); };
const framesFor = (durationMs, fps) => Math.max(1, Math.round(durationMs / 1000 * fps));
const rect = value => ({left: value.left ?? value.x, top: value.top ?? value.y,
  right: value.right ?? value.x + value.width, bottom: value.bottom ?? value.y + value.height});
const sized = value => ({...value, width: value.right - value.left, height: value.bottom - value.top});
const inside = (a, b) => a.left >= b.left && a.top >= b.top && a.right <= b.right && a.bottom <= b.bottom;
const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const validRect = value => value && ['left','top','right','bottom'].every(key => finite(value[key])) && value.right > value.left && value.bottom > value.top;

/** One evaluator owns numeric geometry and the legacy CSS strings. */
export function ugcTextMotionGeometry(entrance, keyword, frame, fps) {
  const seconds = Math.max(0, frame) / Math.max(1, fps);
  const t = Math.min(1, seconds / .24);
  const eased = 1 - Math.pow(1 - t, 3);
  return {
    opacity: entrance === 'none' ? 1 : t,
    x: entrance === 'slide-in' ? (1-eased)*-60 : 0,
    y: entrance === 'rise' ? (1-eased)*40 : 0,
    scale: entrance === 'pop' ? .8+.2*eased : entrance === 'bounce' ? 1 - (1-t)*Math.cos(t*Math.PI*2)*.2 : 1,
    emphasisScale: keyword === 'pulse' ? 1 + .035*Math.sin(seconds*Math.PI*4) : 1,
    emphasisY: keyword === 'wave' ? 3*Math.sin(seconds*Math.PI*3) : 0,
    emphasisX: keyword === 'glitch' && frame % 18 < 2 ? frame % 2 ? -2 : 2 : 0,
  };
}

/** Keep these strings byte-identical for existing ugc-v3 edits. */
export function ugcTextMotion(entrance, keyword, frame, fps) {
  const value = ugcTextMotionGeometry(entrance, keyword, frame, fps);
  const container = {opacity: value.opacity, transform: ''};
  if (entrance === 'rise') container.transform = `translateY(${value.y}px)`;
  if (entrance === 'slide-in') container.transform = `translateX(${value.x}px)`;
  if (entrance === 'pop' || entrance === 'bounce') container.transform = `scale(${value.scale})`;
  const emphasis = {display: 'inline-block', transform: ''};
  if (keyword === 'pulse') emphasis.transform = `scale(${value.emphasisScale})`;
  if (keyword === 'wave') emphasis.transform = `translateY(${value.emphasisY}px)`;
  if (keyword === 'glitch' && frame % 18 < 2) emphasis.transform = `translateX(${value.emphasisX}px)`;
  return {container, emphasis};
}

/** Canonical fingerprint of the parent attributes covered by explicit matrix samples. */
export function organicParentSignature(clip = {}) {
  const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
  return JSON.stringify(sorted({transforms: clip.transforms ?? null, keyframes: clip.keyframes ?? [], effects: clip.effects ?? []}));
}

/** Fail at authoring and render if parent motion has not been included in the measured geometry. */
export function assertOrganicTextParent(style, clip = {}) {
  if (style.parentFrames) {
    if (style.parentSignature !== organicParentSignature(clip)) fail('ORGANIC_TEXT_PARENT_MISMATCH', 'Parent transforms changed after layout authoring.');
    return true;
  }
  const transforms = clip.transforms ?? {};
  const identity = {x: 0, y: 0, scale: 1, rotation: 0, opacity: 1};
  if (Object.entries(identity).some(([key, value]) => transforms[key] !== undefined && transforms[key] !== value)
    || (clip.keyframes ?? []).length || (clip.effects ?? []).some(effect => effect.disabled !== true)) {
    fail('ORGANIC_TEXT_PARENT_UNSUPPORTED', 'Nonidentity parent effects require explicit verified per-frame matrices.');
  }
  return true;
}

function measureWidth(measure, text, size, font) {
  const result = measure(text, size, font);
  const width = typeof result === 'number' ? result : result?.width;
  if (!finite(width) || width < 0) fail('ORGANIC_TEXT_MEASUREMENT_INVALID', 'Every measured line must have a finite nonnegative width.');
  return width;
}

function wrap(text, width, size, measure, font, maxLines) {
  const lines = [];
  for (const paragraph of text.trim().split(/\n/u)) {
    let line = '';
    for (const word of paragraph.trim().split(/\s+/u).filter(Boolean)) {
      if (measureWidth(measure, word, size, font) > width) return null;
      const proposed = line ? `${line} ${word}` : word;
      if (line && measureWidth(measure, proposed, size, font) > width) { lines.push(line); line = word; }
      else line = proposed;
      if (lines.length >= maxLines) return null;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) return null;
  }
  return lines.length ? lines : null;
}

function expand(box, x, y = x) {
  return {left: box.left - x, right: box.right + x, top: box.top - y, bottom: box.bottom + y};
}

/** Conservative painted bounds at an actual output frame, including local and baked parent motion. */
export function organicTextBoundsAtFrame(style, frame) {
  const motion = ugcTextMotionGeometry(style.entrance, style.keywordMotion, frame, style.fps);
  const panelX = style.background?.paddingX ?? 0;
  const panelY = style.background?.paddingY ?? 0;
  const stroke = style.strokeWidth / 2;
  const shadow = style.shadow;
  // Two blur radii conservatively cover CSS shadow painting; this is not a face detector.
  const blur = (shadow?.blur ?? 0) * 2;
  let bounds = {
    left: style.x - Math.max(panelX, stroke, stroke + blur - (shadow?.x ?? 0)),
    right: style.x + style.width + Math.max(panelX, stroke, stroke + blur + (shadow?.x ?? 0)),
    top: style.y - Math.max(panelY, stroke, stroke + blur - (shadow?.y ?? 0)),
    bottom: style.y + style.height + Math.max(panelY, stroke, stroke + blur + (shadow?.y ?? 0)),
  };
  // Emphasis may sit anywhere on any prepared line. Inflate conservatively instead of guessing its center.
  if (style.emphasis) {
    bounds = expand(bounds, Math.max(0, motion.emphasisScale - 1) * style.width + Math.abs(motion.emphasisX),
      Math.max(0, motion.emphasisScale - 1) * style.height + Math.abs(motion.emphasisY));
  }
  const cx = style.x + style.width / 2;
  const cy = style.y + style.height / 2;
  bounds = {left: cx + (bounds.left - cx) * motion.scale + motion.x,
    right: cx + (bounds.right - cx) * motion.scale + motion.x,
    top: cy + (bounds.top - cy) * motion.scale + motion.y,
    bottom: cy + (bounds.bottom - cy) * motion.scale + motion.y};
  const matrix = style.parentFrames?.[frame];
  if (matrix) {
    const points = [[bounds.left,bounds.top],[bounds.right,bounds.top],[bounds.right,bounds.bottom],[bounds.left,bounds.bottom]]
      .map(([x,y]) => ({x: matrix[0]*x + matrix[2]*y + matrix[4], y: matrix[1]*x + matrix[3]*y + matrix[5]}));
    bounds = {left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
      top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y))};
  }
  return sized(bounds);
}

function validateShape(style) {
  if (!style || style.layoutVersion !== ORGANIC_TEXT_PROFILE) fail('ORGANIC_TEXT_LAYOUT_INVALID', 'An authored organic-v1 layout is required.');
  if (!Array.isArray(style.lines) || !style.lines.length || style.lines.length > 2 || style.lines.some(line => typeof line !== 'string' || !line.trim() || /\n/u.test(line))) {
    fail('ORGANIC_TEXT_LAYOUT_INVALID', 'One or two nonempty prepared lines are required.');
  }
  for (const key of ['x','y','width','height','fontSize','lineHeight','fontWeight','letterSpacing','startMs','durationMs','fps','strokeWidth']) {
    if (!finite(style[key])) fail('ORGANIC_TEXT_LAYOUT_INVALID', `Invalid ${key}.`);
  }
  if (style.width <= 0 || style.fontSize < 32 || style.fontSize > 160 || style.height <= 0 || style.lineHeight < 1 || style.lineHeight > 2 || style.durationMs <= 0 || style.startMs < 0 || style.fps < 1 || style.fps > 120 || framesFor(style.durationMs, style.fps) > 36000 || style.strokeWidth < 0 || style.strokeWidth > 16 || Math.abs(style.letterSpacing) > 10) {
    fail('ORGANIC_TEXT_LAYOUT_INVALID', 'Typography, timing or frame count is outside supported bounds.');
  }
  if (!((style.fontFamily === 'Black Han Sans' && style.fontWeight === 400) || (style.fontFamily === 'Noto Sans KR' && style.fontWeight === 500))) {
    fail('ORGANIC_TEXT_FONT_UNSUPPORTED', 'An exact supported font family and weight must be measured.');
  }
  if (!style.measurementId || typeof style.measurementId !== 'string') fail('ORGANIC_TEXT_MEASUREMENT_REQUIRED', 'The actual font measurement source is required.');
  if (typeof style.emphasis !== 'string' || (style.emphasis && !style.lines.some(line => line.includes(style.emphasis)))) fail('ORGANIC_TEXT_EMPHASIS_INVALID', 'The selected phrase must remain intact on a prepared line.');
  if (!ENTRANCES.includes(style.entrance) || !KEYWORD_MOTIONS.includes(style.keywordMotion)) fail('ORGANIC_TEXT_MOTION_UNSUPPORTED', 'The selected text motion is unsupported.');
  if (!validRect(style.safeArea)) fail('ORGANIC_TEXT_LAYOUT_INVALID', 'A current explicit safe area is required.');
  if (!Array.isArray(style.lineWidths) || style.lineWidths.length !== style.lines.length || style.lineWidths.some(width => !finite(width) || width < 0 || width > style.width)) fail('ORGANIC_TEXT_LINE_OVERFLOW', 'Prepared line metrics exceed their stored width.');
  if (Math.abs(style.height - style.lines.length * style.fontSize * style.lineHeight) > .01) fail('ORGANIC_TEXT_LAYOUT_INVALID', 'Stored height must match the actual line count.');
  if (style.background !== null && (!style.background || typeof style.background.color !== 'string' || ['paddingX','paddingY','borderRadius'].some(key => !finite(style.background[key]) || style.background[key] < 0 || style.background[key] > 64))) fail('ORGANIC_TEXT_LAYOUT_INVALID', 'Use an explicit panel or null transparent background.');
  if (!style.shadow || typeof style.shadow.color !== 'string' || ['x','y','blur'].some(key => !finite(style.shadow[key]) || Math.abs(style.shadow[key]) > 64) || style.shadow.blur < 0 || typeof style.strokeColor !== 'string') fail('ORGANIC_TEXT_LAYOUT_INVALID', 'Explicit stroke and shadow are required.');
  if (style.parentFrames !== undefined && (!Array.isArray(style.parentFrames) || style.parentFrames.length !== framesFor(style.durationMs, style.fps) || !style.parentSignature || style.parentFrames.some(matrix => !Array.isArray(matrix) || matrix.length !== 6 || matrix.some(value => !finite(value))))) {
    fail('ORGANIC_TEXT_PARENT_FRAMES_INVALID', 'Every output frame needs a finite affine matrix and its parent signature.');
  }
}

/** Recheck JSON-authored styles before persistence; it does not authenticate the font measurement source. */
export function validateOrganicTextLayout(style, context = {}) {
  validateShape(style);
  if (context.clip) assertOrganicTextParent(style, context.clip);
  if (context.text !== undefined && normalize(style.lines.join(' ')) !== normalize(context.text)) fail('ORGANIC_TEXT_SOURCE_MISMATCH', 'Prepared lines must preserve the entire original text.');
  for (const key of ['startMs','durationMs','fps']) {
    if (context[key] !== undefined && context[key] !== style[key]) fail('ORGANIC_TEXT_TIMING_MISMATCH', `Stored ${key} differs from the clip.`);
  }
  const regions = [...(context.protectedRegions ?? []), ...(context.occupiedRegions ?? [])];
  for (const region of regions) {
    if (!validRect(rect(region)) || (region.startMs !== undefined && !finite(region.startMs)) || (region.endMs !== undefined && !finite(region.endMs)) || (region.startMs !== undefined && region.endMs !== undefined && region.endMs <= region.startMs)) fail('ORGANIC_TEXT_REGION_INVALID', 'Observed regions must have valid spatial and time bounds.');
  }
  const total = framesFor(style.durationMs, style.fps);
  let bounds;
  for (let frame = 0; frame < total; frame++) {
    const current = organicTextBoundsAtFrame(style, frame);
    if (!inside(current, style.safeArea)) fail('ORGANIC_TEXT_UNSAFE_BOUNDS', `Painted text crosses the safe area at frame ${frame}.`);
    // Sequence.from rounds to an output frame; protection must use the same global clock.
    const atMs = (Math.round(style.startMs / 1000 * style.fps) + frame) / style.fps * 1000;
    for (const region of regions) {
      if (atMs >= (region.startMs ?? -Infinity) && atMs < (region.endMs ?? Infinity) && overlap(current, rect(region))) {
        fail('ORGANIC_TEXT_PROTECTED_OVERLAP', `Text overlaps observed ${region.role ?? region.id ?? 'content'} at frame ${frame}.`);
      }
    }
    bounds = bounds ? {left: Math.min(bounds.left,current.left), top: Math.min(bounds.top,current.top), right: Math.max(bounds.right,current.right), bottom: Math.max(bounds.bottom,current.bottom)} : current;
  }
  return {valid: true, bounds: sized(bounds), sampledFrames: total, measurementId: style.measurementId};
}

export function assertOrganicTextLayout(style, text) {
  validateOrganicTextLayout(style, {text});
  return style;
}

/** Actual canvas verification runs after the exact font is loaded; never changes stored line breaks. */
export function verifyOrganicTextMetrics(style, measureText, tolerance = .75) {
  validateShape(style);
  if (typeof measureText !== 'function') fail('ORGANIC_TEXT_MEASUREMENT_REQUIRED', 'A loaded-font measure callback is required.');
  for (let index = 0; index < style.lines.length; index++) {
    const measured = measureText(style.lines[index], style.fontSize, style);
    const width = typeof measured === 'number' ? measured : measured?.width;
    if (!finite(width) || Math.abs(width - style.lineWidths[index]) > tolerance || width > style.width + tolerance) fail('ORGANIC_TEXT_FONT_METRICS_MISMATCH', `Loaded font width disagrees with prepared line ${index + 1}.`);
    const glyphHeight = (measured?.actualBoundingBoxAscent ?? 0) + (measured?.actualBoundingBoxDescent ?? 0);
    if (glyphHeight > style.fontSize * style.lineHeight + tolerance) fail('ORGANIC_TEXT_FONT_METRICS_MISMATCH', 'Loaded glyphs extend beyond the authored line height.');
  }
  return {valid: true, measurementId: style.measurementId};
}

/** Resolve position, size and line breaks before rendering. Candidate order expresses host intent. */
export function authorOrganicTextLayout(input) {
  const {text, kind = 'caption', font = {}, measurementId, safeArea, startMs, durationMs, fps = 30} = input;
  const measure = input.measureText ?? (input.measurements ? (text, size) => input.measurements[String(size)]?.[text] : undefined);
  if (typeof measure !== 'function' || !measurementId) fail('ORGANIC_TEXT_MEASUREMENT_REQUIRED', 'Measure the exact loaded font before authoring.');
  if (!normalize(text)) fail('ORGANIC_TEXT_SOURCE_MISMATCH', 'Nonempty original text is required.');
  const safe = rect(safeArea ?? {});
  if (!validRect(safe)) fail('ORGANIC_TEXT_LAYOUT_INVALID', 'A current explicit safe area is required.');
  const widths = input.widths ?? [32, 96, 160, 224].map(padding => safe.right - safe.left - padding).filter(width => width > 0);
  const sizes = input.fontSizes ?? (kind === 'title' ? [96,88,80,72] : [76,72,68,64,60]);
  const placements = input.placements ?? (kind === 'title' ? [{y: 310},{y: 560},{y: 900}] : [{y: 970},{y: 780},{y: 560},{y: 310}]);
  const fontStyle = {fontFamily: font.fontFamily, fontWeight: font.fontWeight, letterSpacing: font.letterSpacing ?? 0};
  for (const size of sizes) {
    for (const placement of placements) {
      for (const width of widths) {
        if (!finite(size) || !finite(width) || width <= 0) fail('ORGANIC_TEXT_LAYOUT_INVALID', 'Candidate font sizes and widths must be finite and positive.');
        const lines = wrap(String(text), width, size, measure, fontStyle, input.maxLines ?? 2);
        if (!lines) continue;
        if (input.emphasis && !lines.some(line => line.includes(input.emphasis))) continue;
        const x = placement.x ?? (placement.align === 'left' ? safe.left + 16 : placement.align === 'right' ? safe.right - width - 16 : safe.left + (safe.right - safe.left - width) / 2);
        const lineHeight = font.lineHeight ?? 1.16;
        const style = {layoutVersion: ORGANIC_TEXT_PROFILE, x, y: placement.y, width, height: lines.length * size * lineHeight,
          fontSize: size, lineHeight, ...fontStyle, lines, lineWidths: lines.map(line => measureWidth(measure, line, size, fontStyle)),
          measurementId, safeArea: safe, startMs, durationMs, fps,
          entrance: input.entrance ?? 'none', keywordMotion: input.keywordMotion ?? 'none', emphasis: input.emphasis ?? '', variant: input.variant ?? 'plain',
          background: input.background ?? null, strokeWidth: input.strokeWidth ?? (kind === 'title' ? 5 : 4), strokeColor: input.strokeColor ?? '#151515',
          shadow: input.shadow ?? {x: 0, y: 3, blur: 5, color: 'rgba(0,0,0,0.6)'},
          ...(input.parentFrames ? {parentFrames: input.parentFrames, parentSignature: input.parentSignature} : {}),
        };
        try {
          const checked = validateOrganicTextLayout(style, {text, protectedRegions: input.protectedRegions, occupiedRegions: input.occupiedRegions});
          return {...style, bounds: checked.bounds};
        } catch (error) {
          if (!['ORGANIC_TEXT_UNSAFE_BOUNDS', 'ORGANIC_TEXT_PROTECTED_OVERLAP'].includes(error.code)) throw error;
        }
      }
    }
  }
  fail('ORGANIC_TEXT_NO_SAFE_FIT', 'No candidate preserves all words inside the observed safe layout. Revise the authored position, width or phrase clip.');
}
