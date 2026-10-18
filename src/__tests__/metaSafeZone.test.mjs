import test from 'node:test';
import assert from 'node:assert/strict';
import {authorOrganicTextLayout,validateOrganicTextLayout} from '../lib/organicText.mjs';
const input=(patch={})=>({text:'승인 원문 보존',kind:'caption',measureText:(s,size)=>({width:s.length*size*.6}),measurementId:'test-explicit-metrics',
 font:{fontFamily:'Black Han Sans',fontWeight:400},startMs:0,durationMs:1000,fps:30,fontSizes:[56],widths:[600],placements:[{y:900}],...patch});
test('native authoring resolves mandatory safety when caller omits the rectangle',()=>{
 const style=authorOrganicTextLayout(input());assert.ok(style.safeArea.top>=269);assert.ok(style.safeArea.bottom<=1248);
});
test('full-canvas native authoring cannot admit text behind Meta UI',()=>{
 assert.throws(()=>authorOrganicTextLayout(input({safeArea:{left:0,top:0,right:1080,bottom:1920},placements:[{y:1450}]})),/NO_SAFE_FIT/);
});
test('stored native geometry is rechecked against policy even with a widened rectangle',()=>{
 const style=authorOrganicTextLayout(input({safeArea:{left:90,top:270,right:918,bottom:1248}}));
 assert.throws(()=>validateOrganicTextLayout({...style,y:1500,safeArea:{left:0,top:0,right:1080,bottom:1920}}),/UNSAFE_BOUNDS/);
});
