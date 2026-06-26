import type React from 'react';
import {
	useCurrentFrame,
	useVideoConfig,
	interpolate,
	AbsoluteFill,
} from 'remotion';

type EdgeType = 'left' | 'right' | 'top' | 'bottom' | 'auto';
type EdgeValue = 'left' | 'right' | 'top' | 'bottom';

export interface LightLeakProps {
	/**
	 * Array of frame numbers at which to trigger light leaks.
	 * Each trigger will bloom a soft warm leak from an edge.
	 */
	triggerFrames: number[];

	/**
	 * Duration (in frames) over which each light leak blooms and fades.
	 * @default 10
	 */
	windowFrames?: number;

	/**
	 * RGBA color string for the leak glow.
	 * Default is a warm golden-orange: rgba(255, 176, 87, 0.55)
	 * @default "rgba(255,176,87,0.55)"
	 */
	color?: string;

	/**
	 * Which edge the leak originates from.
	 * 'auto' deterministically alternates by trigger index.
	 * @default "auto"
	 */
	edge?: EdgeType;
}

/**
 * Helper: Determine which edge to use for a given trigger index.
 * When edge === 'auto', alternate deterministically: 0→left, 1→right, 2→top, 3→bottom, repeat.
 */
function getEdgeForTrigger(
	triggerIndex: number,
	overrideEdge: EdgeType
): EdgeValue {
	if (overrideEdge !== 'auto') {
		return overrideEdge as EdgeValue;
	}
	const edges: EdgeValue[] = [
		'left',
		'right',
		'top',
		'bottom',
	];
	return edges[triggerIndex % edges.length];
}

/**
 * Helper: Build a CSS gradient for the light leak from a given edge.
 * Uses a linear gradient that blooms from the edge and fades inward.
 */
function getLightLeakGradient(
	edge: EdgeValue,
	color: string
): string {
	// Use linear-gradient from the edge, fading to transparent.
	switch (edge) {
		case 'left':
			return `linear-gradient(to right, ${color}, transparent 40%)`;
		case 'right':
			return `linear-gradient(to left, ${color}, transparent 40%)`;
		case 'top':
			return `linear-gradient(to bottom, ${color}, transparent 40%)`;
		case 'bottom':
			return `linear-gradient(to top, ${color}, transparent 40%)`;
	}
}

/**
 * LightLeak: A cinematic light leak effect component.
 *
 * Renders as an AbsoluteFill overlay. Near each frame in `triggerFrames`,
 * a soft warm linear gradient blooms from one edge, peaking at the
 * trigger frame's center, then fading. Outside the bloom windows, opacity is 0.
 *
 * Blend mode is 'screen' for additive glow; pointer events are disabled.
 * Fully deterministic: no Math.random() or Date.now().
 */
export const LightLeak: React.FC<LightLeakProps> = ({
	triggerFrames,
	windowFrames = 10,
	color = 'rgba(255,176,87,0.55)',
	edge = 'auto',
}: LightLeakProps) => {
	const frame = useCurrentFrame();
	useVideoConfig();

	// Find which (if any) trigger window we are currently in.
	let currentTriggerIndex = -1;
	let frameInWindow = -1;

	for (let i = 0; i < triggerFrames.length; i++) {
		const triggerFrame = triggerFrames[i];
		const windowStart = triggerFrame - Math.floor(windowFrames / 2);
		const windowEnd = triggerFrame + Math.ceil(windowFrames / 2);

		if (frame >= windowStart && frame < windowEnd) {
			currentTriggerIndex = i;
			frameInWindow = frame - windowStart;
			break;
		}
	}

	// If not in any window, return invisible overlay.
	if (currentTriggerIndex === -1) {
		return (
			<AbsoluteFill
				style={{
					opacity: 0,
					pointerEvents: 'none',
					mixBlendMode: 'screen',
				}}
			/>
		);
	}

	// Interpolate opacity: rises to 1.0 mid-window, then falls back to 0.
	// Use easing-like shape: frame 0-5 rise, frame 5-10 fall (for windowFrames=10).
	const midPoint = windowFrames / 2;
	let opacityValue: number;

	if (frameInWindow < midPoint) {
		// Rising phase: 0 -> 1
		opacityValue = interpolate(frameInWindow, [0, midPoint], [0, 1], {
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		});
	} else {
		// Falling phase: 1 -> 0
		opacityValue = interpolate(
			frameInWindow,
			[midPoint, windowFrames],
			[1, 0],
			{
				extrapolateLeft: 'clamp',
				extrapolateRight: 'clamp',
			}
		);
	}

	// Determine the edge for this trigger (deterministically).
	const edgeForTrigger = getEdgeForTrigger(currentTriggerIndex, edge);

	// Build gradient.
	const gradient = getLightLeakGradient(edgeForTrigger, color);

	// Position the gradient container based on edge.
	// For left/right edges, use full height; for top/bottom, use full width.
	const baseStyle: React.CSSProperties = {
		position: 'absolute',
		pointerEvents: 'none',
		mixBlendMode: 'screen',
		opacity: opacityValue,
		background: gradient,
	};

	// Edge-specific sizing and positioning.
	const styleByEdge: Record<EdgeValue, React.CSSProperties> = {
		left: {
			...baseStyle,
			left: 0,
			top: 0,
			bottom: 0,
			width: '40%',
		},
		right: {
			...baseStyle,
			right: 0,
			top: 0,
			bottom: 0,
			width: '40%',
		},
		top: {
			...baseStyle,
			top: 0,
			left: 0,
			right: 0,
			height: '40%',
		},
		bottom: {
			...baseStyle,
			bottom: 0,
			left: 0,
			right: 0,
			height: '40%',
		},
	};

	return (
		<AbsoluteFill style={styleByEdge[edgeForTrigger]} />
	);
};

export default LightLeak;
