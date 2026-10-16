/** Opt-in, clip-local visual effects shared by Native authoring and rendering.
 * Unmarked legacy effects keep their original full-clip behavior. */
export const NATIVE_SHOT_EFFECTS_CONTRACT='native-shot-effects-v1';
export const NATIVE_SHOT_EFFECT_KINDS=Object.freeze(['filter','adjust','glow','grain','vignette','shake','light-leak']);
export const NATIVE_FILTER_PRESETS=Object.freeze(['warm','cool','film','bw','noir','vivid','fade','vintage','dreamy']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const only=(value,keys)=>object(value)&&Object.keys(value).every(key=>keys.includes(key));
const number=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
const invalid=()=>new TypeError('NATIVE_SHOT_EFFECT_INVALID');

export function validateNativeShotEffect(effect,durationMs) {
  if(!only(effect,['kind','params','contract','startMs','endMs'])||effect.contract!==NATIVE_SHOT_EFFECTS_CONTRACT||
    !NATIVE_SHOT_EFFECT_KINDS.includes(effect.kind)||!number(durationMs,1,90000))throw invalid();
  const ranged=Object.hasOwn(effect,'startMs')||Object.hasOwn(effect,'endMs');
  if(ranged&&(!Number.isSafeInteger(effect.startMs)||!Number.isSafeInteger(effect.endMs)||
    effect.startMs<0||effect.startMs>=effect.endMs||effect.endMs>durationMs))throw invalid();
  const p=effect.params;
  switch(effect.kind) {
    case 'filter':
      if(!only(p,['preset'])||!NATIVE_FILTER_PRESETS.includes(p.preset))throw invalid();
      break;
    case 'adjust':
      if(!only(p,['brightness','contrast','saturation','temperature'])||
        !['brightness','contrast','saturation'].every(key=>number(p[key],0,3))||!number(p.temperature,-100,100))throw invalid();
      break;
    case 'glow':
      if(!only(p,['radiusPx','color'])||!number(p.radiusPx,0,64)||typeof p.color!=='string'||!/^#[a-f0-9]{6}$/i.test(p.color))throw invalid();
      break;
    case 'grain': case 'vignette':
      if(!only(p,['opacity'])||!number(p.opacity,0,1))throw invalid();
      break;
    case 'shake':
      if(!only(p,['amplitudePx','speed'])||!number(p.amplitudePx,0,24)||!number(p.speed,.1,4))throw invalid();
      break;
    case 'light-leak':
      if(!only(p,['intensity'])||!number(p.intensity,0,1))throw invalid();
      break;
  }
  return effect;
}

export function nativeShotEffectActive(effect,localMs) {
  if(effect?.contract!==NATIVE_SHOT_EFFECTS_CONTRACT)return true;
  if(!Number.isFinite(localMs))return false;
  return effect.startMs===undefined||localMs>=effect.startMs&&localMs<effect.endMs;
}
