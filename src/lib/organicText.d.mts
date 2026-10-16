export const ORGANIC_TEXT_PROFILE: 'organic-v1';
export type OrganicRect = {left: number; top: number; right: number; bottom: number};
export type OrganicBounds = OrganicRect & {width: number; height: number};
export type OrganicFont = {fontFamily: 'Black Han Sans' | 'Noto Sans KR'; fontWeight: 400 | 500; letterSpacing?: number; lineHeight?: number};
export type OrganicRegion = (OrganicRect | {x: number; y: number; width: number; height: number}) & {id?: string; role?: string; startMs?: number; endMs?: number};
export type OrganicEntrance = 'none' | 'fade-in' | 'rise' | 'pop' | 'bounce' | 'slide-in';
export type OrganicKeywordMotion = 'none' | 'pulse' | 'wave' | 'glitch';
export type OrganicPanel = {color: string; paddingX: number; paddingY: number; borderRadius: number};
export type OrganicShadow = {x: number; y: number; blur: number; color: string};
export type OrganicMatrix = [number, number, number, number, number, number];
export type OrganicTextStyle = {
  layoutVersion: 'organic-v1'; x: number; y: number; width: number; height: number;
  fontSize: number; lineHeight: number; fontFamily: OrganicFont['fontFamily']; fontWeight: OrganicFont['fontWeight']; letterSpacing: number;
  lines: string[]; lineWidths: number[]; measurementId: string; safeArea: OrganicRect;
  startMs: number; durationMs: number; fps: number;
  entrance: OrganicEntrance; keywordMotion: OrganicKeywordMotion; emphasis: string; variant: string;
  background: OrganicPanel | null; strokeWidth: number; strokeColor: string; shadow: OrganicShadow;
  parentFrames?: OrganicMatrix[]; parentSignature?: string; bounds?: OrganicBounds;
};
export type OrganicMeasure = (text: string, size: number, font: OrganicFont | OrganicTextStyle) => number | {width: number; actualBoundingBoxAscent?: number; actualBoundingBoxDescent?: number};
export type OrganicContext = {
  text?: string; kind?: string; startMs?: number; durationMs?: number; fps?: number; clip?: object;
  protectedRegions?: OrganicRegion[]; occupiedRegions?: OrganicRegion[];
};
export type OrganicAuthorInput = Omit<OrganicContext, 'clip'> & {
  text: string; font: OrganicFont; measurementId: string; safeArea: OrganicRect; startMs: number; durationMs: number;
  measureText?: OrganicMeasure; measurements?: Record<string, Record<string, number>>;
  placements?: {x?: number; y: number; align?: 'left' | 'center' | 'right'}[];
  fontSizes?: number[]; widths?: number[]; maxLines?: number;
  entrance?: OrganicEntrance; keywordMotion?: OrganicKeywordMotion; emphasis?: string; variant?: string;
  background?: OrganicPanel | null; strokeWidth?: number; strokeColor?: string; shadow?: OrganicShadow;
  parentFrames?: OrganicMatrix[]; parentSignature?: string;
};
export const ORGANIC_FONT_DESCRIPTORS: Readonly<Record<OrganicFont['fontFamily'], Readonly<OrganicFont & {googleFontModule: string}>>>;
export function organicParentSignature(clip?: object): string;
export function assertOrganicTextParent(style: OrganicTextStyle, clip?: object): true;
export function ugcTextMotionGeometry(entrance: string, keyword: string, frame: number, fps: number): {
  opacity: number; x: number; y: number; scale: number; emphasisScale: number; emphasisY: number; emphasisX: number;
};
export function ugcTextMotion(entrance: string, keyword: string, frame: number, fps: number): {
  container: {opacity: number; transform: string}; emphasis: {display: 'inline-block'; transform: string};
};
export function organicTextBoundsAtFrame(style: OrganicTextStyle, frame: number): OrganicBounds;
export function validateOrganicTextLayout(style: unknown, context?: OrganicContext): {valid: true; bounds: OrganicBounds; sampledFrames: number; measurementId: string};
export function assertOrganicTextLayout(style: unknown, text?: string): OrganicTextStyle;
export function verifyOrganicTextMetrics(style: OrganicTextStyle, measureText: OrganicMeasure, tolerance?: number): {valid: true; measurementId: string};
export function authorOrganicTextLayout(input: OrganicAuthorInput): OrganicTextStyle;
