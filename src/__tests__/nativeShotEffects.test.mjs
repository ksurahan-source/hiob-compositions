import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NATIVE_SHOT_EFFECTS_CONTRACT as contract,validateNativeShotEffect,nativeShotEffectActive} from '../lib/nativeShotEffects.mjs';
const effect=(kind,params,range={})=>({contract,kind,params,...range});
test('each typed effect has bounded explicit parameters and clip-local ranges',()=>{
  const values=[effect('filter',{preset:'film'}),effect('adjust',{brightness:1.03,contrast:1.1,saturation:.95,temperature:5}),
    effect('glow',{radiusPx:12,color:'#FFE6A2'}),effect('grain',{opacity:.15}),effect('vignette',{opacity:.3}),
    effect('shake',{amplitudePx:4,speed:1.7}),effect('light-leak',{intensity:.5})];
  for(const value of values)assert.equal(validateNativeShotEffect({...value,startMs:200,endMs:700},1000).kind,value.kind);
  for(const value of values)for(const range of [{startMs:-1,endMs:700},{startMs:700,endMs:700},{startMs:200,endMs:1001},{startMs:200},{endMs:700},{startMs:200.1,endMs:700}])
    assert.throws(()=>validateNativeShotEffect({...value,...range},1000),/NATIVE_SHOT_EFFECT_INVALID/);
  for(const value of [effect('filter',{preset:'unknown'}),effect('adjust',{brightness:1,contrast:1,saturation:1}),effect('glow',{radiusPx:65,color:'#ffffff'}),
    effect('glow',{radiusPx:2,color:'url(https://example.com)'}),effect('grain',{opacity:1.1}),effect('shake',{amplitudePx:25,speed:1}),effect('shake',{amplitudePx:4,speed:0}),
    effect('light-leak',{intensity:NaN}),effect('flash',{intensity:.5}),{...values[0],disabled:true},{...values[0],params:{preset:'film',arbitrary:true}}])
    assert.throws(()=>validateNativeShotEffect(value,1000),/NATIVE_SHOT_EFFECT_INVALID/);
});
test('range is start-inclusive and end-exclusive; unmarked legacy effects are unaffected',()=>{
  const value=effect('shake',{amplitudePx:4,speed:1},{startMs:200,endMs:700});
  assert.deepEqual([199,200,699,700].map(ms=>nativeShotEffectActive(value,ms)),[false,true,true,false]);
  assert.equal(nativeShotEffectActive(effect('grain',{opacity:.2}),900),true);
  assert.equal(nativeShotEffectActive({kind:'grain',startMs:200,endMs:700},100),true);
  assert.equal(nativeShotEffectActive(value,NaN),false);
});
