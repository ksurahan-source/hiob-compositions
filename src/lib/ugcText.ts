export const UGC_TEXT_PROFILE = 'ugc-v3';
export const UGC_SAFE_AREA = Object.freeze({ left: 90, top: 270, right: 918, bottom: 1248 });
const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
export function ugcTextLayout(kind: string, attributes: Record<string, unknown> = {}) {
  const raw = attributes.text_style && typeof attributes.text_style === 'object' ? attributes.text_style as Record<string, unknown> : {};
  const title = kind === 'title';
  const size = Math.max(48, Math.min(112, finite(raw.fontSize, (title ? 88 : 72) * 1.15)));
  const height = Math.ceil(size * 1.16 * 2 + 24);
  const width = 804;
  const defaults: Record<string, number> = { top: 300, middle: 680, bottom: 970 };
  const y = finite(raw.y, defaults[String(raw.position)] ?? (title ? 300 : 970));
  return {
    fontSize: size, width, height,
    x: Math.max(UGC_SAFE_AREA.left + 12, Math.min(UGC_SAFE_AREA.right - width - 12, finite(raw.x, 102))),
    y: Math.max(UGC_SAFE_AREA.top + 12, Math.min(UGC_SAFE_AREA.bottom - height - 12, y)),
    variant: ['plain', 'question', 'product', 'cta'].includes(String(raw.variant)) ? String(raw.variant) : 'plain',
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
