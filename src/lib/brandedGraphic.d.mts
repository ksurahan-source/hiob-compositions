export type BrandedKeyframe={atMs:number;dx:number;dy:number;opacity:number;reveal:number};
export type BrandedBox={x:number;y:number;width:number;height:number};
export type BrandedLayer={id:string;kind:'text'|'vector';startMs:number;endMs:number;box:BrandedBox;keyframes:BrandedKeyframe[];text?:string;fontFamily?:'Noto Sans KR'|'Inter';fontSize?:number;fontWeight?:number;fill?:string;measurement?:{left:number;right:number;ascent:number;descent:number;advance:number};viewBox?:number[];primitives?:({kind:string;fill:string;stroke:string;strokeWidth:number;opacity:number}&Record<string,unknown>)[];gradients?:{id:string;x1:number;y1:number;x2:number;y2:number;stops:{offset:number;color:string;opacity:number}[]}[]};
export type BrandedGraphic={contract:'branded-graphic-v1';source:{clipId:string;sha256:string;templateSha256:string;approvedTexts:string[]};background:string|null;safeArea:{left:number;top:number;right:number;bottom:number};protectedRegions:(BrandedBox&{startMs:number;endMs:number})[];layers:BrandedLayer[]};
export const BRANDED_GRAPHIC_CONTRACT:'branded-graphic-v1';
export function brandedLayerState(layer:BrandedLayer,ms:number):{dx:number;dy:number;opacity:number;reveal:number};
export function validateBrandedGraphic(value:unknown,context?:{clip?:object;clips?:object[];tracks?:object[];width?:number;height?:number;fps?:number}):{valid:true;layers:number;finalVideoObserved:false};
export function verifyBrandedTextMetrics(layer:BrandedLayer,measure:(text:string)=>TextMetrics):void;
