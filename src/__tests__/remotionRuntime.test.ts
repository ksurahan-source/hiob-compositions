import { describe, expect, it } from 'vitest';

import {
  EXPECTED_REMOTION_VERSION,
  assertRemotionRuntimeVersion,
} from '../remotionRuntime';

describe('Remotion runtime integrity', () => {
  it('accepts the single pinned runtime version', () => {
    expect(assertRemotionRuntimeVersion()).toBe(EXPECTED_REMOTION_VERSION);
  });

  it('fails closed when a consumer resolves a different runtime', () => {
    expect(() => assertRemotionRuntimeVersion('4.0.466')).toThrow(
      'Remotion runtime mismatch: expected 4.0.513, received 4.0.466',
    );
  });
});
