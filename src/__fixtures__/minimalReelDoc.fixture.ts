/**
 * Minimal valid ReelDoc fixture — used by all interpreter tests.
 *
 * One video element + one audio element, no animations, 3s duration.
 * The video UUID is stable so hash-seeded presets produce deterministic results.
 */
import type { ReelDoc } from '@hiob/timeline/schema';

const NOW = '2026-06-18T00:00:00.000Z';

export const MINIMAL_REEL_DOC: ReelDoc = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  version: '1.0',
  schemaHash: 'eng04-fixture-v1',
  created: NOW,
  updated: NOW,
  title: 'Minimal Test Reel',
  outputFormat: {
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    fps: '30',
    durationMs: 3000,
  },
  elements: [
    {
      type: 'video',
      id: 'vid-fixture-001',
      src: 'https://storage.googleapis.com/hiob-test/test.mp4',
      duration: 3000,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      opacity: 1,
      scale: 1,
      rotation: 0,
      zIndex: 0,
      loop: false,
      muted: false,
      startFrom: 0,
      volume: 1,
      fit: 'cover',
      animations: [],
    },
    {
      type: 'audio',
      id: 'aud-fixture-001',
      src: 'https://storage.googleapis.com/hiob-test/voice.mp3',
      startTime: 0,
      duration: 3000,
      volume: 1,
      loop: false,
      category: 'voice',
    },
  ],
};

export const ANIMATED_REEL_DOC: ReelDoc = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  version: '1.0',
  schemaHash: 'eng04-fixture-v1',
  created: NOW,
  updated: NOW,
  title: 'Animated Test Reel',
  outputFormat: {
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    fps: '30',
    durationMs: 3000,
  },
  elements: [
    {
      type: 'video',
      id: 'vid-fixture-002',
      src: 'https://storage.googleapis.com/hiob-test/test2.mp4',
      duration: 3000,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      opacity: 1,
      scale: 1,
      rotation: 0,
      zIndex: 0,
      loop: false,
      muted: false,
      startFrom: 0,
      volume: 1,
      fit: 'cover',
      animations: [
        {
          type: 'property',
          startTime: 0,
          duration: 1000,
          easing: 'ease-out',
          keyframes: [
            { time: 0, opacity: 0 },
            { time: 100, opacity: 1 },
          ],
        },
      ],
    },
    {
      type: 'text',
      id: 'txt-fixture-001',
      text: '테스트 텍스트',
      x: 0,
      y: 75,
      width: 100,
      opacity: 1,
      zIndex: 10,
      fontSize: 52,
      fontFamily: '"Noto Sans KR", sans-serif',
      fontWeight: '700',
      color: '#FFFFFF',
      textAlign: 'center',
      blur: false,
      animations: [],
    },
  ],
};
