import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ugcTextLayout, phraseGroups, UGC_SAFE_AREA } from '../lib/ugcText.ts';
test('large preset preserves the renderer 88/72px baseline at 1.15x', () => {
 assert.equal(ugcTextLayout('title').fontSize, 88*1.15);
 assert.equal(ugcTextLayout('caption').fontSize, 72*1.15);
});
test('manual positions include outline padding inside the safe area', () => {
 for (const point of [{x:-100,y:-200},{x:1000,y:1900}]) {
  const box=ugcTextLayout('caption',{text_style:{...point,fontSize:112}});
  assert.ok(box.x>=UGC_SAFE_AREA.left+12);assert.ok(box.x+box.width<=UGC_SAFE_AREA.right-12);
  assert.ok(box.y>=UGC_SAFE_AREA.top+12);assert.ok(box.y+box.height<=UGC_SAFE_AREA.bottom-12);
 }
});
test('phrase splitting retains every word and never creates more than two lines', () => {
 const text='수영하러 왔는데 수경만 씻고 있다고요? 한 바퀴 돌고 헹구고 다시 쓰고 또 멈추고';
 const groups=phraseGroups(text);
 assert.equal(groups.join(' ').replace(/\s+/g,' '),text);
 assert.ok(groups.length>1);assert.ok(groups.every(group=>group.split('\n').length<=2));
});

test('cinematic typography remains explicitly selected and inside the same platform safe area', () => {
 const box=ugcTextLayout('caption',{text_style:{variant:'cinematic',fontSize:54,y:1800}});
 assert.equal(box.variant,'cinematic');assert.equal(box.fontSize,54);
 assert.ok(box.y+box.height<=UGC_SAFE_AREA.bottom-12);
 assert.equal(ugcTextLayout('caption',{text_style:{variant:'unrecognized'}}).variant,'plain');
});

test('chosen width clamps position with the exact rendered box', () => {
 const box=ugcTextLayout('caption',{text_style:{width:420,x:900,y:2000,fontSize:64}});
 assert.equal(box.width,420);assert.equal(box.x,UGC_SAFE_AREA.right-420-12);
 assert.equal(ugcTextLayout('caption',{text_style:{width:10}}).width,240);
 assert.equal(ugcTextLayout('caption',{text_style:{width:10000}}).width,804);
});
test('selected entrance and keyword motion are normalized and change frame styles',async()=>{
 const {ugcTextMotion}=await import('../lib/ugcText.ts');
 const box=ugcTextLayout('caption',{text_style:{entrance:'rise',keywordMotion:'pulse'}});
 assert.equal(box.entrance,'rise');assert.equal(box.keywordMotion,'pulse');
 const first=ugcTextMotion(box.entrance,box.keywordMotion,0,30);
 const settled=ugcTextMotion(box.entrance,box.keywordMotion,10,30);
 assert.equal(first.container.opacity,0);assert.equal(settled.container.opacity,1);
 assert.notEqual(first.container.transform,settled.container.transform);
 assert.notEqual(first.emphasis.transform,settled.emphasis.transform);
 assert.deepEqual(ugcTextMotion('none','none',0,30),{container:{opacity:1,transform:''},emphasis:{display:'inline-block',transform:''}});
 assert.equal(ugcTextLayout('caption',{text_style:{entrance:'made-up'}}).entrance,'none');
 assert.equal(ugcTextLayout('caption',{caption_entrance_effect:'bounce'}).entrance,'bounce');
});
