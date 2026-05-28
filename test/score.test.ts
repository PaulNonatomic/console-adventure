import { describe, it, expect } from 'vitest';
import { computeMaxScore, tierFor } from '../src/score.js';
import type { Scene, Tier } from '../src/types.js';

/**
 * The reconverging-branches graph: two parallel scenes both
 * feed into a shared tail. Naive "sum per scene's max choice"
 * would double-count the tail; the DFS must memoise.
 */
const reconvergingScenes: Record<string, Scene> = {
	start: {
		heading: 'start',
		narration: [],
		choices: [
			{ label: 'left', points: 2, next: 'left' },
			{ label: 'right', points: 1, next: 'right' }
		]
	},
	left: {
		heading: 'left',
		narration: [],
		choices: [{ label: 'continue', points: 3, next: 'tail' }]
	},
	right: {
		heading: 'right',
		narration: [],
		choices: [{ label: 'continue', points: 3, next: 'tail' }]
	},
	tail: {
		heading: 'tail',
		narration: [],
		choices: [{ label: 'end', points: 3, next: null }]
	}
};

describe('computeMaxScore', () => {
	it('returns 0 for an empty graph', () => {
		expect(
			computeMaxScore({ start: 'nowhere', scenes: {} })
		).toBe(0);
	});

	it('sums the best choice along the single-path winner', () => {
		// Best path: start(2) -> left(3) -> tail(3) = 8.
		expect(
			computeMaxScore({ start: 'start', scenes: reconvergingScenes })
		).toBe(8);
	});

	it("doesn't double-count a tail shared by parallel branches", () => {
		// If the tail were counted twice, max would be 11.
		// The memo guarantees we only count it once.
		expect(
			computeMaxScore({ start: 'start', scenes: reconvergingScenes })
		).toBeLessThan(11);
	});

	it('ignores undefined points (treats them as 0)', () => {
		const scenes: Record<string, Scene> = {
			a: { heading: 'a', narration: [], choices: [{ label: 'x', next: 'b' }] },
			b: { heading: 'b', narration: [], choices: [{ label: 'end', points: 4, next: null }] }
		};
		expect(computeMaxScore({ start: 'a', scenes })).toBe(4);
	});

	it('handles a self-cycle gracefully (no infinite recursion)', () => {
		// `a` points at itself plus an exit. The memo's cache
		// gets set before the recursive call returns, so the
		// self-reference reads the in-progress 0 instead of
		// recursing forever.
		const scenes: Record<string, Scene> = {
			a: {
				heading: 'a',
				narration: [],
				choices: [
					{ label: 'loop', points: 1, next: 'a' },
					{ label: 'exit', points: 5, next: null }
				]
			}
		};
		// Should not stack-overflow.
		expect(() =>
			computeMaxScore({ start: 'a', scenes })
		).not.toThrow();
	});
});

describe('tierFor', () => {
	const tiers: Tier[] = [
		{ minScore: 0, label: 'Newbie' },
		{ minScore: 5, label: 'Solid' },
		{ minScore: 10, label: 'Legend' }
	];

	it('returns the highest qualifying tier', () => {
		expect(tierFor(0, tiers)).toBe('Newbie');
		expect(tierFor(4, tiers)).toBe('Newbie');
		expect(tierFor(5, tiers)).toBe('Solid');
		expect(tierFor(9, tiers)).toBe('Solid');
		expect(tierFor(10, tiers)).toBe('Legend');
		expect(tierFor(999, tiers)).toBe('Legend');
	});

	it('respects unordered tier tables', () => {
		const shuffled: Tier[] = [
			{ minScore: 10, label: 'Legend' },
			{ minScore: 0, label: 'Newbie' },
			{ minScore: 5, label: 'Solid' }
		];
		expect(tierFor(7, shuffled)).toBe('Solid');
	});

	it('returns the default fallback when no tiers are supplied', () => {
		expect(tierFor(0, undefined)).toBe('Player');
		expect(tierFor(0, [])).toBe('Player');
	});

	it('honours a custom fallback', () => {
		expect(tierFor(0, undefined, 'unranked')).toBe('unranked');
	});

	it('returns the fallback when no tier qualifies', () => {
		const noZero: Tier[] = [{ minScore: 5, label: 'Solid' }];
		// 3 doesn't meet the 5 threshold and there's no lower tier.
		expect(tierFor(3, noZero)).toBe('Player');
	});
});
