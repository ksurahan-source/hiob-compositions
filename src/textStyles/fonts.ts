// Korean OFL fonts for the text style pack.
// Files come from github.com/google/fonts (OFL) pinned to one commit via jsDelivr, so a
// render always gets the same bytes. Only the families a chosen style uses are fetched
// (one TTF per face), avoiding the hundreds of unicode-range requests that
// @remotion/google-fonts makes for Korean families.

export const GOOGLE_FONTS_COMMIT = '24ddc1f324cac5d9f5aedca126d298f56e3f1640';
const FONT_BASE = `https://cdn.jsdelivr.net/gh/google/fonts@${GOOGLE_FONTS_COMMIT}/ofl`;

export type FontKey =
  | 'blackHanSans'
  | 'notoSansKR'
  | 'gowunBatang'
  | 'nanumMyeongjo'
  | 'doHyeon'
  | 'jua'
  | 'gowunDodum'
  | 'nanumPenScript'
  | 'ibmPlexSansKR'
  | 'songMyung';

interface FontFaceSpec {
  path: string;
  weight: string;
}

interface FontFamilySpec {
  family: string;
  fallback: string;
  faces: FontFaceSpec[];
}

export const FONT_FAMILIES: Record<FontKey, FontFamilySpec> = {
  blackHanSans: { family: 'HiobBlackHanSans', fallback: 'sans-serif', faces: [{ path: 'blackhansans/BlackHanSans-Regular.ttf', weight: '400' }] },
  // variable font: any weight 100–900
  notoSansKR: { family: 'HiobNotoSansKR', fallback: 'sans-serif', faces: [{ path: 'notosanskr/NotoSansKR%5Bwght%5D.ttf', weight: '100 900' }] },
  gowunBatang: {
    family: 'HiobGowunBatang',
    fallback: 'serif',
    faces: [
      { path: 'gowunbatang/GowunBatang-Regular.ttf', weight: '400' },
      { path: 'gowunbatang/GowunBatang-Bold.ttf', weight: '700' },
    ],
  },
  nanumMyeongjo: {
    family: 'HiobNanumMyeongjo',
    fallback: 'serif',
    faces: [
      { path: 'nanummyeongjo/NanumMyeongjo-Regular.ttf', weight: '400' },
      { path: 'nanummyeongjo/NanumMyeongjo-Bold.ttf', weight: '700' },
      { path: 'nanummyeongjo/NanumMyeongjo-ExtraBold.ttf', weight: '800' },
    ],
  },
  doHyeon: { family: 'HiobDoHyeon', fallback: 'sans-serif', faces: [{ path: 'dohyeon/DoHyeon-Regular.ttf', weight: '400' }] },
  jua: { family: 'HiobJua', fallback: 'sans-serif', faces: [{ path: 'jua/Jua-Regular.ttf', weight: '400' }] },
  gowunDodum: { family: 'HiobGowunDodum', fallback: 'sans-serif', faces: [{ path: 'gowundodum/GowunDodum-Regular.ttf', weight: '400' }] },
  nanumPenScript: { family: 'HiobNanumPenScript', fallback: 'cursive', faces: [{ path: 'nanumpenscript/NanumPenScript-Regular.ttf', weight: '400' }] },
  ibmPlexSansKR: {
    family: 'HiobIBMPlexSansKR',
    fallback: 'sans-serif',
    faces: [
      { path: 'ibmplexsanskr/IBMPlexSansKR-Regular.ttf', weight: '400' },
      { path: 'ibmplexsanskr/IBMPlexSansKR-Bold.ttf', weight: '700' },
    ],
  },
  songMyung: { family: 'HiobSongMyung', fallback: 'serif', faces: [{ path: 'songmyung/SongMyung-Regular.ttf', weight: '400' }] },
};

export const FONT_KEYS = Object.keys(FONT_FAMILIES) as FontKey[];

/** CSS font-family stacks used by presets. */
export const FONT = Object.fromEntries(
  FONT_KEYS.map((key) => [key, `"${FONT_FAMILIES[key].family}", ${FONT_FAMILIES[key].fallback}`]),
) as Record<FontKey, string>;

export function fontFaceUrl(path: string): string {
  return `${FONT_BASE}/${path}`;
}

/** A family, or one weight of it (`'gowunBatang@700'`) to skip faces a style never uses. */
export type FontRequest = FontKey | `${FontKey}@${string}`;

export function facesFor(request: FontRequest): { family: string; face: FontFaceSpec }[] {
  const [key, weight] = request.split('@') as [FontKey, string | undefined];
  const spec = FONT_FAMILIES[key];
  const faces = weight === undefined ? spec.faces : spec.faces.filter((face) => face.weight === weight);
  if (faces.length === 0) throw new Error(`text style font ${request} has no matching face`);
  return faces.map((face) => ({ family: spec.family, face }));
}

/** Per-attempt cap so a hung download still leaves room for the retry inside delayRender. */
export const FONT_ATTEMPT_TIMEOUT_MS = 45_000;

const loading = new Map<string, Promise<void>>();

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`font load timed out after ${ms}ms: ${label}`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function loadFace(family: string, face: FontFaceSpec, timeoutMs: number): Promise<void> {
  const fontFace = new FontFace(family, `url(${fontFaceUrl(face.path)}) format('truetype')`, { weight: face.weight });
  return withTimeout(fontFace.load(), timeoutMs, face.path).then((loaded) => {
    document.fonts.add(loaded);
  });
}

/**
 * Loads the requested faces once per page. A failed face is evicted so the next call retries
 * it, and the rejection reaches the caller (the render gate decides how to surface it).
 */
export function ensureFonts(requests: readonly FontRequest[], timeoutMs = FONT_ATTEMPT_TIMEOUT_MS): Promise<void> {
  return Promise.all(
    requests.flatMap(facesFor).map(({ family, face }) => {
      const existing = loading.get(face.path);
      if (existing) return existing;
      const pending = loadFace(family, face, timeoutMs).catch((error: unknown) => {
        loading.delete(face.path);
        throw error;
      });
      loading.set(face.path, pending);
      return pending;
    }),
  ).then(() => undefined);
}

/** test-only: forget loaded faces */
export function resetFontCacheForTests(): void {
  loading.clear();
}
