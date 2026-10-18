import {META_SAFE_ZONE_POLICY} from './meta-safe-zone.mjs';
import {validateOrganicTextLayout} from './organicText.mjs';
import {validateNativeStyle} from './nativeStyle.mjs';
/** Unmeasured text is repairable, never presumed safe from its preset name. */
export function assertNativeMetaSafeZone(props) {
 const {clips=[],width=1080,height=1920,fps=30}=props;
 for(const clip of clips){
  if(clip.attributes?.native_style!==undefined)validateNativeStyle(clip.attributes.native_style,{clip,clips,width,height,fps});
  const kind=clip.trackKind??clip.track_kind;
  if(!['title','caption','overlay'].includes(kind)||clip.url||!(clip.textContent??clip.text_content??'').trim())continue;
  const style=clip.attributes?.text_style;
  if(!['organic-v1','organic-v2'].includes(style?.layoutVersion))throw Object.assign(new Error('ORGANIC_TEXT_MEASUREMENT_REQUIRED: Prepare the exact existing text with native_edit.prepare_text before rendering.'),{code:'ORGANIC_TEXT_MEASUREMENT_REQUIRED'});
  validateOrganicTextLayout(style,{text:clip.textContent??clip.text_content,startMs:clip.startMs??clip.start_ms,
   durationMs:clip.durationMs??clip.duration_ms,fps,clip,protectedRegions:clip.attributes?.organic_text_v1?.protected_regions??[]});
 }
 return {policyVersion:META_SAFE_ZONE_POLICY.version,geometryChecked:true,finalVideoObserved:false};
}
