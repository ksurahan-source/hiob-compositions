export const NATIVE_SHOT_EFFECTS_CONTRACT: 'native-shot-effects-v1';
export const NATIVE_SHOT_EFFECT_KINDS: readonly string[];
export const NATIVE_FILTER_PRESETS: readonly string[];
export function validateNativeShotEffect<T>(effect: T, durationMs: number): T;
export function nativeShotEffectActive(effect: unknown, localMs: number): boolean;
