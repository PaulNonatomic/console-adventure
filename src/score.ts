/**
 * Pure-function helpers for scoring and tier resolution.
 *
 * These were originally private to the `createAdventure`
 * factory (which still calls them internally), but the editor /
 * tooling case wants the same answers *without* having to spin
 * up a runtime `Adventure` instance. So they're exposed here
 * as a tiny separate module — same algorithms, no engine
 * lifecycle, no state.
 *
 * Single-source-of-truth: the factory in `adventure.ts` now
 * delegates to these functions, so anything that walks the
 * scene graph for a max-score or resolves a tier uses one
 * implementation. Studios and other downstream tools should
 * import from here rather than reimplement.
 */
import type { Scene, Tier } from './types.js';

/**
 * Minimum graph shape these helpers need to walk. Both the
 * runtime `AdventureConfig` (functions for share/hooks) and
 * the wire-format `AdventureJson` (templates for share) match
 * this structurally, so a single function signature covers
 * both call sites without conversion.
 */
export interface ScoreableGraph {
	start: string;
	scenes: Record<string, Scene>;
}

/**
 * Max achievable score across all paths in a scene graph.
 *
 * Memoised depth-first search — handles reconverging branches
 * (e.g. two scenes both pointing to a third) correctly, never
 * double-counting the shared tail.
 *
 * Accepts anything with the minimum required shape (a `start`
 * id and a `scenes` map), so both the runtime `AdventureConfig`
 * and the wire-format `AdventureJson` work directly — no
 * conversion at the call site.
 */
export function computeMaxScore(source: ScoreableGraph): number {
	const cache = new Map<string, number>();
	function bestFrom(sceneId: string): number {
		const cached = cache.get(sceneId);
		if (cached !== undefined) return cached;
		const scene = source.scenes[sceneId];
		if (!scene) {
			cache.set(sceneId, 0);
			return 0;
		}
		// Seed with 0 BEFORE descending so a recursive call that
		// loops back to this same scene (a cyclic narrative)
		// short-circuits instead of stack-overflowing. The real
		// value replaces this sentinel once the descent
		// completes; non-cyclic graphs see no behavioural change.
		cache.set(sceneId, 0);
		const best = Math.max(
			...scene.choices.map(
				(c) => (c.points ?? 0) + (c.next ? bestFrom(c.next) : 0)
			)
		);
		cache.set(sceneId, best);
		return best;
	}
	return bestFrom(source.start);
}

/**
 * Resolve a tier label from a final score against a (possibly
 * unordered) tier table.
 *
 * Returns the label of the highest-`minScore` tier whose
 * threshold the player meets, or the fallback string when no
 * tier qualifies (which includes the case where no tier table
 * was supplied).
 *
 * Fallback defaults to `'Player'` — matches the runtime
 * Adventure's behaviour. Pass a different fallback to suppress
 * it (e.g. `null` for "no tier" rendering in an editor).
 */
export function tierFor(
	score: number,
	tiers: Tier[] | undefined,
	fallback: string = 'Player'
): string {
	if (!tiers || tiers.length === 0) return fallback;
	// Sort high-to-low; first qualifying threshold wins.
	for (const tier of [...tiers].sort((a, b) => b.minScore - a.minScore)) {
		if (score >= tier.minScore) return tier.label;
	}
	return fallback;
}
