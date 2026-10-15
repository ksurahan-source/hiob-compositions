export const UGC_TEXT_PROFILE = 'ugc-v3';
export const UGC_SAFE_AREA = Object.freeze({ left: 90, top: 270, right: 918, bottom: 1248 });
const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
export function ugcTextLayout(kind: string, attributes: Record<string, unknown> = {}) {
  const raw = attributes.text_style && typeof attributes.text_style === 'object' ? attributes.text_style as Record<string, unknown> : {};
  const title = kind === 'title';
  const size = Math.max(48, Math.min(112, finite(raw.fontSize, (title ? 88 : 72) * 1.15)));
  const height = Math.ceil(size * 1.16 * 2 + 24);
  const width = Math.max(240, Math.min(804, finite(raw.width, 804)));
  const defaults: Record<string, number> = { top: 300, middle: 680, bottom: 970 };
  const y = finite(raw.y, defaults[String(raw.position)] ?? (title ? 300 : 970));
  return {
    fontSize: size, width, height,
    x: Math.max(UGC_SAFE_AREA.left + 12, Math.min(UGC_SAFE_AREA.right - width - 12, finite(raw.x, 102))),
    y: Math.max(UGC_SAFE_AREA.top + 12, Math.min(UGC_SAFE_AREA.bottom - height - 12, y)),
    variant: ['plain', 'question', 'product', 'cta', 'cinematic'].includes(String(raw.variant)) ? String(raw.variant) : 'plain',
    entrance: ['none', 'fade-in', 'rise', 'pop', 'bounce', 'slide-in'].includes(String(raw.entrance ?? attributes.caption_entrance_effect)) ? String(raw.entrance ?? attributes.caption_entrance_effect) : 'none',
    keywordMotion: ['none', 'pulse', 'wave', 'glitch'].includes(String(raw.keywordMotion ?? attributes.caption_keyword_motion)) ? String(raw.keywordMotion ?? attributes.caption_keyword_motion) : 'none',
    emphasis: String(raw.emphasis ?? (attributes.caption_emphasis_words as string[] | undefined)?.[0] ?? ''),
  };
}

/** Preserve explicit line breaks; phrase grouping happens before clips are materialized. */
export function phraseGroups(text: string, maxChars = 10): string[] {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && [...`${line} ${word}`].length > maxChars) { lines.push(line); line = ''; }
    line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  const groups: string[] = [];
  for (let index = 0; index < lines.length; index += 2) groups.push(lines.slice(index, index + 2).join('\n'));
  return groups;
}

/** Clip-local and deterministic: the same frame styles drive preview and server. */
export function ugcTextMotion(entrance: string, keyword: string, frame: number, fps: number) {
  const seconds = Math.max(0, frame) / Math.max(1, fps);
  const t = Math.min(1, seconds / .24);
  const eased = 1 - Math.pow(1 - t, 3);
  const container: {opacity: number; transform: string} = {opacity: 1, transform: ''};
  if (entrance !== 'none') container.opacity = t;
  if (entrance === 'rise') container.transform = `translateY(${(1-eased)*40}px)`;
  if (entrance === 'slide-in') container.transform = `translateX(${(1-eased)*-60}px)`;
  if (entrance === 'pop') container.transform = `scale(${.8+.2*eased})`;
  if (entrance === 'bounce') container.transform = `scale(${1 - (1-t)*Math.cos(t*Math.PI*2)*.2})`;
  const emphasis: {display: 'inline-block'; transform: string} = {display: 'inline-block', transform: ''};
  if (keyword === 'pulse') emphasis.transform = `scale(${1 + .035*Math.sin(seconds*Math.PI*4)})`;
  if (keyword === 'wave') emphasis.transform = `translateY(${3*Math.sin(seconds*Math.PI*3)}px)`;
  if (keyword === 'glitch' && frame % 18 < 2) emphasis.transform = `translateX(${frame % 2 ? -2 : 2}px)`;
  return {container, emphasis};
}
