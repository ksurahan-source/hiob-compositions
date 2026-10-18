// Shared verbatim by authoring, server admission, preview and final rendering.
// Conservative Meta UI protection also applies to nonvertical HIOB canvases.
export const META_SAFE_ZONE_POLICY = Object.freeze({schema:'HIOB.MetaSafeZone.v1',version:'meta-2026-10-18',
  top:.14,bottom:.35,left:.06,right:.06,source:'https://www.facebook.com/business/ads/facebook-instagram-reels-ads'});
export function metaSafeArea({width=1080,height=1920}={}) {
  if(![width,height].every(n=>Number.isFinite(n)&&n>0))throw new RangeError('Invalid safe zone canvas');
  return {left:Math.ceil(width*META_SAFE_ZONE_POLICY.left),top:Math.ceil(height*META_SAFE_ZONE_POLICY.top),
    right:Math.floor(width*(1-META_SAFE_ZONE_POLICY.right)),bottom:Math.floor(height*(1-META_SAFE_ZONE_POLICY.bottom))};
}
export function resolveMetaSafeArea(authored,canvas) {
  const policy=metaSafeArea(canvas);
  if(authored===undefined||authored===null)return policy;
  if(!['left','top','right','bottom'].every(k=>Number.isFinite(authored[k]))||authored.left>=authored.right||authored.top>=authored.bottom)
    throw new RangeError('Invalid authored safe zone');
  const area={left:Math.max(policy.left,authored.left),top:Math.max(policy.top,authored.top),
    right:Math.min(policy.right,authored.right),bottom:Math.min(policy.bottom,authored.bottom)};
  if(area.left>=area.right||area.top>=area.bottom)throw new RangeError('Authored safe zone has no Meta-safe intersection');
  return area;
}
export function insideMetaSafeArea(bounds,canvas,authored) {
  const area=resolveMetaSafeArea(authored,canvas);
  return ['left','top','right','bottom'].every(k=>Number.isFinite(bounds[k]))&&bounds.left>=area.left-1e-7&&bounds.top>=area.top-1e-7
    &&bounds.right<=area.right+1e-7&&bounds.bottom<=area.bottom+1e-7;
}
