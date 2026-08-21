import { VERSION as installedRemotionVersion } from 'remotion';

export const EXPECTED_REMOTION_VERSION = '4.0.513';

export function assertRemotionRuntimeVersion(actualVersion = installedRemotionVersion): string {
  if (actualVersion !== EXPECTED_REMOTION_VERSION) {
    throw new Error(
      `Remotion runtime mismatch: expected ${EXPECTED_REMOTION_VERSION}, received ${actualVersion}`,
    );
  }
  return actualVersion;
}

assertRemotionRuntimeVersion();
