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
