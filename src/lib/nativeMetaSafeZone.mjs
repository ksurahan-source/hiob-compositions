import {META_SAFE_ZONE_POLICY} from './meta-safe-zone.mjs';
import {validateOrganicTextLayout} from './organicText.mjs';
import {validateBrandedGraphic} from './brandedGraphic.mjs';
import {validateNativeStyle} from './nativeStyle.mjs';
export function nativeClipRenderKind(clip) {
 const kind=clip.trackKind??clip.track_kind;
 if(clip.assetKind==='audio'||['audio','music','sfx'].includes(kind))return 'audio';
 if(clip.url&&(['image','video'].includes(clip.assetKind)||['video','overlay'].includes(kind)))return 'visual';
 return 'text';
}
/** Unmeasured text is repairable, never presumed safe from its preset name. */
export function assertNativeMetaSafeZone(props) {
 const {clips=[],width=1080,height=1920,fps=30}=props;
 if(width!==1080||height!==1920)throw Object.assign(new Error('NATIVE_RENDER_UNSUPPORTED_FORMAT: Native measured layouts currently support 1080x1920; use the supported shared edit for other canvases.'),{code:'NATIVE_RENDER_UNSUPPORTED_FORMAT'});
 for(const clip of clips){
  if(clip.attributes?.branded_graphic_v1!==undefined)validateBrandedGraphic(clip.attributes.branded_graphic_v1,{clip,clips,width,height,fps});
  if(clip.attributes?.native_style!==undefined)validateNativeStyle(clip.attributes.native_style,{clip,clips,width,height,fps});
  const kind=clip.trackKind??clip.track_kind;
  if(clip.effects?.some(e=>e.kind==='watermark'&&e.disabled!==true))throw Object.assign(new Error('ORGANIC_TEXT_MEASUREMENT_REQUIRED: Watermark logos need a measured safe-zone renderer.'),{code:'ORGANIC_TEXT_MEASUREMENT_REQUIRED'});
  const rendered=nativeClipRenderKind(clip);
  if(rendered==='audio')continue;
  if(rendered==='visual'){
   if(kind!=='video')throw Object.assign(new Error('ORGANIC_TEXT_MEASUREMENT_REQUIRED: Visual logo/CTA overlays need a supported measured renderer; full-bleed media is restricted to background video tracks.'),{code:'ORGANIC_TEXT_MEASUREMENT_REQUIRED'});
   continue;
  }
  if(!(clip.textContent??clip.text_content??clip.attributes?.social_proof_wording??'').trim())continue;
  const style=clip.attributes?.text_style;
  if(!['organic-v1','organic-v2'].includes(style?.layoutVersion))throw Object.assign(new Error('ORGANIC_TEXT_MEASUREMENT_REQUIRED: Prepare the exact existing text with native_edit.prepare_text before rendering.'),{code:'ORGANIC_TEXT_MEASUREMENT_REQUIRED'});
  if(!['title','caption'].includes(kind)||clip.attributes?.text_profile!==style.layoutVersion)throw Object.assign(new Error('ORGANIC_TEXT_LAYOUT_INVALID: The measured text profile must select the same supported title/caption renderer.'),{code:'ORGANIC_TEXT_LAYOUT_INVALID'});
  validateOrganicTextLayout(style,{text:clip.textContent??clip.text_content,startMs:clip.startMs??clip.start_ms,
   durationMs:clip.durationMs??clip.duration_ms,fps,clip,protectedRegions:clip.attributes?.organic_text_v1?.protected_regions??[]});
 }
 return {policyVersion:META_SAFE_ZONE_POLICY.version,geometryChecked:true,finalVideoObserved:false};
}
