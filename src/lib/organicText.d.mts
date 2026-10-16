export const ORGANIC_TEXT_PROFILE: 'organic-v1';
export const ORGANIC_TEXT_V2_PROFILE: 'organic-v2';
export function isOrganicTextProfile(value:unknown):boolean;
export type OrganicMotion = {entranceMs:number;intensity:number;settle:number;exit:'none'|'fade-out'|'rise-out'|'shrink';exitMs:number};
export type OrganicPalette = {base:string;accent:string;contrast:string;alert:string};
export type OrganicSemanticSpan = {text:string;startMs:number;endMs:number;color:'accent'|'contrast'|'alert';motion:'none'|'pulse'|'lift';intensity:number};
export type OrganicResolvedSpan = OrganicSemanticSpan & {line:number;start:number;end:number};
export type OrganicFill = {kind:'linear';angle:number;colors:[string,string]};
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
  layoutVersion: 'organic-v1' | 'organic-v2';
  motion?:OrganicMotion;palette?:OrganicPalette;emphasisSpans?:OrganicResolvedSpan[];fill?:OrganicFill; x: number; y: number; width: number; height: number;
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
  layoutVersion?:'organic-v1'|'organic-v2';lineGroups?:string[];motion?:OrganicMotion;palette?:OrganicPalette;semanticSpans?:OrganicSemanticSpan[];fill?:OrganicFill;
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

export function organicTextMotionGeometry(style:OrganicTextStyle,frame:number): ReturnType<typeof ugcTextMotionGeometry>;
export function organicTextMotion(style:OrganicTextStyle,frame:number):ReturnType<typeof ugcTextMotion>;
export function organicEmphasisState(style:OrganicTextStyle,span:OrganicResolvedSpan,frame:number):{active:boolean;scale:number;y:number;color:string;transform:string};
