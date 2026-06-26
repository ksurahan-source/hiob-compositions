/**
 * AudioElementRenderer — no-op audio element renderer.
 *
 * Remotion handles audio natively via <Audio> at the Sequence level.
 * Element-level audio nodes are tracked in the data model but rendered
 * by the composition layer, not here. This renderer intentionally returns null.
 */
import type { AudioElement } from '@hiob/timeline/schema';
import type { ElementRendererFn } from './index';
import { defaultElementRendererRegistry } from './index';

const AudioElementRenderer: ElementRendererFn<AudioElement> = () => null;

defaultElementRendererRegistry.register('audio', AudioElementRenderer);

export default AudioElementRenderer;
