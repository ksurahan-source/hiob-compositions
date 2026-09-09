import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioVolumeAt, speechWindows } from '../lib/audioMix.ts';

const music = { trackKind: 'music', startMs: 5000, durationMs: 10000, volume: 0.4 };
const mix = { music: 0.2, voice: 1, sfx: 0.6, autoDuck: true, duck: 0.75, duckFadeMs: 400 };
const windows = [{ startMs: 6000, endMs: 7000 }];

test('ducking uses timeline time and preserves explicit clip gain', () => {
  assert.equal(audioVolumeAt(music, mix, 0, windows), 0.4);
  assert.equal(audioVolumeAt(music, mix, 1000, windows), 0.1);
  assert.equal(audioVolumeAt(music, mix, 2400, windows), 0.4);
});
test('ducking respects zero gain and requested attack/release', () => {
  assert.equal(audioVolumeAt({ ...music, volume: 0 }, mix, 1200, windows), 0);
  assert.equal(audioVolumeAt(music, mix, 800, windows), 0.25);
  assert.equal(audioVolumeAt(music, { ...mix, duckFadeMs: 0 }, 999, windows), 0.4);
});
test('manual fades multiply ducking and clip gain', () => {
  const clip = { ...music, effects: [{ kind: 'fade-in', params: { durationMs: 2000 } }, { kind: 'fade-out', params: { durationMs: 1000 } }] };
  assert.equal(audioVolumeAt(clip, mix, 0, windows), 0);
  assert.equal(audioVolumeAt(clip, mix, 1000, windows), 0.05);
  assert.equal(audioVolumeAt(clip, mix, 9500, windows), 0.2);
});
test('volume keyframes are clip-local and cannot unmute a clip', () => {
  const clip = { ...music, keyframes: [{ property: 'volume', timeMs: 0, value: 0 }, { property: 'volume', timeMs: 2000, value: 1 }] };
  assert.equal(audioVolumeAt(clip, mix, 1000, windows), 0.05);
  assert.equal(audioVolumeAt({ ...clip, volume: 0 }, mix, 2000, windows), 0);
});
test('native source mute/detachment silences sound without removing video', () => {
  const video = { ...music, trackKind: 'video', attributes: { source_audio_mode: 'mute' } };
  assert.equal(audioVolumeAt(video, mix, 0, windows), 0);
  assert.equal(audioVolumeAt({ ...video, attributes: { source_audio_mode: 'detached' } }, mix, 0, windows), 0);
  assert.equal(audioVolumeAt({ ...video, attributes: {} }, mix, 1000, windows), 0.4);
});
test('legacy gain override semantics remain unchanged', () => {
  assert.equal(audioVolumeAt(music, { ...mix, autoDuck: false }, 1000, windows), 0.4);
  assert.equal(audioVolumeAt({ ...music, volume: undefined }, { ...mix, autoDuck: false }, 0, []), 0.2);
});
test('explicit v2 mix multiplies bus and clip gain, including bus silence', () => {
  assert.equal(audioVolumeAt(music, { ...mix, version: 2, autoDuck: false }, 0, []), 0.4 * 0.2);
  assert.equal(audioVolumeAt(music, { ...mix, version: 2, music: 0 }, 1200, windows), 0);
});
test('speech windows ignore muted and ambient tracks and map source words through trim/speed', () => {
  const voice = { trackKind: 'audio', startMs: 10000, durationMs: 4000, inMs: 1000, url: 'voice.wav', attributes: { audio_role: 'narration', speed: 2 }, wordTimings: [{ startMs: 1200, endMs: 2000, word: '아이세이프' }] };
  assert.deepEqual(speechWindows([voice, { ...voice, volume: 0 }, { ...voice, attributes: { audio_role: 'ambience' } }], mix), [{ startMs: 10100, endMs: 10500 }]);
});
