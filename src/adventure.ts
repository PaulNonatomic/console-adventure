/**
 * `createAdventure()` — branching choice-based text adventure
 * factory.
 *
 * Returns an object with three callable methods (`start`,
 * `choose`, `share`) plus introspection getters
 * (`maxScore`, `tierFor`, `getState`) and an
 * `asShellPlugin()` adapter that produces a `ShellPlugin`
 * for `console-shell`.
 *
 * The engine itself is logger-agnostic — it renders via the
 * `logger` passed in config (defaults to `console`). The
 * default theme is console-shell's `DEFAULT_THEME` but can be
 * overridden in config or swapped at attach time by the
 * shell plugin.
 */
import type {
	Theme,
	ThemeColor,
	Logger,
	Shell,
	ShellPlugin
} from 'console-shell';
import { resolveTheme, styleFor, styleBoldFor } from 'console-shell';
import type {
	AdventureConfig,
	Choice,
	CompareOp,
	Condition,
	ItemDef,
	Scene,
	StateEffect,
	Tier
} from './types.js';
import {
	styleSceneHeading,
	styleNarration,
	styleChoice,
	styleResultMarker,
	styleResultText,
	styleResultRule,
	styleFinish
} from './style.js';
import { buildXIntent } from './share.js';
import { computeMaxScore, tierFor as resolveTier } from './score.js';

/** Public state exposed via `getState()` for inspection / tests. */
export interface AdventureState {
	sceneId: string;
	score: number;
	finished: boolean;
	/**
	 * Item ids the player is currently carrying. Multiset --
	 * picking up a second copy of an id appends; dropping
	 * removes a single occurrence.
	 */
	inventory: string[];
	/**
	 * Items currently lying in each scene. Mutable per-run:
	 * seeded from `Scene.items` on start, updated as players
	 * pick up or drop. Scenes with no item activity are absent.
	 */
	sceneItems: Record<string, string[]>;
	/**
	 * Tracked state variables. Seeded from
	 * `AdventureConfig.initialState`; mutated by choice / item
	 * `effects`. Conditions read from here (unset reads as 0).
	 */
	vars: Record<string, number>;
	/**
	 * Scene ids visited so far this run, in order, including the
	 * current one. Drives the `visited` condition kind.
	 */
	visited: string[];
}

export interface Adventure {
	/** Maximum achievable score across all branches. */
	readonly maxScore: number;
	/** Resolve a tier label for a given score. */
	tierFor(score: number): string;
	/** Start (or restart) the game. */
	start(): void;
	/** Pick choice `n` (1-indexed) in the current scene. */
	choose(n: number): void;
	/**
	 * Open the share intent — only after the game has finished,
	 * and only if a `share:` config was supplied. No-ops with a
	 * warning otherwise.
	 */
	share(): void;
	/** Inspect current state. `null` before the first `start()`. */
	getState(): AdventureState | null;
	/**
	 * Pick item `n` (1-indexed) out of the items lying in the
	 * current scene. Moves it from the scene to the player's
	 * inventory and prints a confirmation line.
	 */
	pickup(n: number): void;
	/**
	 * Drop item `n` (1-indexed) from the player's inventory
	 * onto the floor of the current scene. The reverse of
	 * `pickup`.
	 */
	drop(n: number): void;
	/**
	 * Use item `n` (1-indexed) from the player's inventory.
	 * Fires the item's `onUse` effect (flavour, points, scene
	 * jump, consume) when defined; otherwise prints a dim
	 * "nothing happens" line.
	 */
	use(n: number): void;
	/**
	 * Re-print the current scene. Useful after picking up or
	 * dropping an item to refresh which choices are visible.
	 * Aliased to the shell command `look()` when bridged.
	 */
	look(): void;
	/**
	 * Print the current inventory. Empty inventory prints a
	 * dim "your inventory is empty" line.
	 */
	inventory(): void;
	/**
	 * Return a console-shell `ShellPlugin` that registers the
	 * play / choose / share / pickup / drop / use / inventory /
	 * look commands on a shell. Calling `attachTo(shell)`
	 * rebinds the adventure's logger and theme to the shell's
	 * at attach time, so the combined output reads as one
	 * consistent UI.
	 */
	asShellPlugin(): ShellPlugin;
}

export function createAdventure(config: AdventureConfig): Adventure {
	if (!config.scenes[config.start]) {
		throw new Error(
			`[console-adventure] start scene "${config.start}" is not in the scenes map.`
		);
	}

	const maxScore = computeMaxScore(config);

	// Tier label / colour resolution delegates to the public
	// helper in `./score.js`. Tier colour still needs a private
	// lookup because the public `tierFor` only returns the
	// label — colour is internal styling concern.
	const sortedTiers: Tier[] = [...(config.tiers ?? [])].sort(
		(a, b) => b.minScore - a.minScore
	);

	function tierFor(score: number): string {
		return resolveTier(score, config.tiers);
	}

	function tierColorFor(score: number): ThemeColor {
		for (const tier of sortedTiers) {
			if (score >= tier.minScore) return tier.color ?? 'primary';
		}
		return 'primary';
	}

	// Theme and logger are mutable so `asShellPlugin().attachTo()`
	// can rebind them to the shell's. Initially they resolve from
	// config (or console-shell's defaults).
	let theme: Theme = resolveTheme(config.theme);
	let logger: Logger = config.logger ?? {
		// eslint-disable-next-line no-console
		log: (msg: string, ...styles: string[]) => console.log(msg, ...styles)
	};

	let state: AdventureState | null = null;

	function blank(): void {
		logger.log('');
	}

	function start(): void {
		// Seed per-run scene-item state from the static catalogue
		// in each scene's `items`. A scene without items doesn't
		// get an empty array entry -- the per-scene state map is
		// sparse for efficiency, with helpers below treating a
		// missing entry as "no items here right now."
		const sceneItems: Record<string, string[]> = {};
		for (const [sceneId, scene] of Object.entries(config.scenes)) {
			if (scene.items && scene.items.length > 0) {
				sceneItems[sceneId] = [...scene.items];
			}
		}
		state = {
			sceneId: config.start,
			score: 0,
			finished: false,
			inventory: [],
			sceneItems,
			// Clone initialState so mutations don't leak back into
			// the config (which is reused across restarts).
			vars: { ...(config.initialState ?? {}) },
			visited: [config.start]
		};
		config.onStart?.();

		if (config.intro) {
			blank();
			for (const line of config.intro) {
				logger.log(`%c   ${line}`, styleFor(theme, 'dim'));
			}
			blank();
		}
		printScene(config.start);
	}

	function choose(n: number): void {
		if (!state) {
			logger.log(
				'%c   No game in progress. Boot it with `play()`.',
				styleFor(theme, 'dim')
			);
			return;
		}
		if (state.finished) {
			logger.log(
				'%c   Game already finished. Restart with `play()`.',
				styleFor(theme, 'dim')
			);
			return;
		}

		const scene = config.scenes[state.sceneId];
		// `choose(n)` indexes into the VISIBLE list -- the same
		// list `printScene` renders -- so choice numbering stays
		// stable from the player's point of view as gated
		// choices unlock.
		const visible = visibleChoices(scene, state.inventory);
		const entry = visible[n - 1];
		if (!scene || !entry) {
			logger.log(
				`%c   Choice ${n} not available — pick 1–${visible.length}.`,
				styleFor(theme, 'dim')
			);
			return;
		}
		const { choice } = entry;

		// Apply consume / grant inventory effects BEFORE flavour
		// + transition so a choice that grants an item and
		// flavours about it reads coherently. Track what actually
		// changed so the gain/loss can be narrated -- otherwise the
		// inventory shifts silently and the player never learns the
		// item mattered.
		const consumed: string[] = [];
		if (choice.consumes && choice.consumes.length > 0) {
			for (const id of choice.consumes) {
				const idx = state.inventory.indexOf(id);
				if (idx >= 0) {
					state.inventory.splice(idx, 1);
					consumed.push(id);
				}
			}
		}
		const granted: string[] = [];
		if (choice.grants && choice.grants.length > 0) {
			for (const id of choice.grants) {
				state.inventory.push(id);
				granted.push(id);
			}
		}

		state.score += choice.points ?? 0;

		// State effects run before the transition resolves so a
		// branch on this same choice can read a value it just
		// set (e.g. "+1 trust, then route to the ally scene if
		// trust >= 3").
		applyEffects(choice.effects);

		if (choice.flavour) {
			printResultCallout(choice.flavour);
		}

		// Narrate inventory changes the choice caused, after the
		// flavour beat so the story reads first and the mechanical
		// note follows. Gains before losses ("you gain the key …
		// you use up the lantern").
		if (granted.length > 0) {
			logger.log(
				`%c   You gain ${listItemsWithThe(granted)}.`,
				styleFor(theme, 'accent')
			);
		}
		if (consumed.length > 0) {
			logger.log(
				`%c   You use up ${listItemsWithThe(consumed)}.`,
				styleFor(theme, 'accent')
			);
		}

		// Resolve the destination: a matching branch wins,
		// otherwise the plain `next` is the fallback.
		const dest = resolveNext(choice);
		advanceTo(dest);
	}

	/* ─── state effects + conditions ──────────────────────── */

	function applyEffects(effects: StateEffect[] | undefined): void {
		if (!state || !effects) return;
		for (const fx of effects) {
			const current = state.vars[fx.var] ?? 0;
			state.vars[fx.var] = fx.op === 'add' ? current + fx.value : fx.value;
		}
	}

	function compare(a: number, op: CompareOp, b: number): boolean {
		switch (op) {
			case '==':
				return a === b;
			case '!=':
				return a !== b;
			case '>=':
				return a >= b;
			case '<=':
				return a <= b;
			case '>':
				return a > b;
			case '<':
				return a < b;
			default:
				return false;
		}
	}

	function matchCondition(cond: Condition): boolean {
		if (!state) return false;
		switch (cond.kind) {
			case 'hasItem': {
				const has = state.inventory.includes(cond.item);
				return cond.negate ? !has : has;
			}
			case 'var':
				return compare(state.vars[cond.var] ?? 0, cond.op, cond.value);
			case 'score':
				return compare(state.score, cond.op, cond.value);
			case 'visited': {
				const seen = state.visited.includes(cond.scene);
				return cond.negate ? !seen : seen;
			}
			default:
				return false;
		}
	}

	/** All conditions ANDed; an empty list always matches. */
	function matchAll(conds: Condition[]): boolean {
		return conds.every((c) => matchCondition(c));
	}

	/**
	 * Pick a choice's destination. First branch whose `when`
	 * all hold wins; otherwise the plain `next` fallback.
	 */
	function resolveNext(choice: Choice): string | null {
		if (choice.branches) {
			for (const branch of choice.branches) {
				if (matchAll(branch.when)) return branch.goTo;
			}
		}
		return choice.next;
	}

	/** Advance to a resolved destination (or finish on null). */
	function advanceTo(dest: string | null): void {
		if (!state) return;
		if (dest === null) {
			finish();
			return;
		}
		state.sceneId = dest;
		if (state.visited[state.visited.length - 1] !== dest) {
			state.visited.push(dest);
		}
		printScene(dest);
	}

	/* ─── items: pickup / drop / use / inventory / look ───── */

	/**
	 * Return only the choices the player can currently take in
	 * a scene -- i.e. choices whose `requires` array (if any) is
	 * fully satisfied by the current inventory. Keeps each
	 * surviving choice's `originalIndex` for callers that need
	 * to map back to the unfiltered scene definition.
	 */
	function visibleChoices(
		scene: Scene | undefined,
		inventory: string[]
	): Array<{ choice: Choice; originalIndex: number }> {
		if (!scene) return [];
		const list: Array<{ choice: Choice; originalIndex: number }> = [];
		scene.choices.forEach((choice, i) => {
			if (choice.requires && choice.requires.length > 0) {
				const has = (id: string) => inventory.includes(id);
				if (!choice.requires.every(has)) return;
			}
			list.push({ choice, originalIndex: i });
		});
		return list;
	}

	function itemDisplay(id: string): string {
		const item: ItemDef | undefined = config.items?.[id];
		return item?.name ?? id;
	}

	// "the lantern" / "the lantern and the key" / "the lantern, the
	// key and the coin" -- used to narrate item gains/losses that a
	// choice triggers, so they never happen silently.
	function listItemsWithThe(ids: string[]): string {
		const parts = ids.map((id) => `the ${itemDisplay(id)}`);
		if (parts.length <= 1) return parts[0] ?? '';
		if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
		return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
	}

	function pickup(n: number): void {
		if (!state) {
			logger.log(
				'%c   No game in progress. Boot it with `play()`.',
				styleFor(theme, 'dim')
			);
			return;
		}
		if (state.finished) {
			logger.log(
				'%c   Game already finished. Restart with `play()`.',
				styleFor(theme, 'dim')
			);
			return;
		}
		const here = state.sceneItems[state.sceneId] ?? [];
		const itemId = here[n - 1];
		if (!itemId) {
			logger.log(
				`%c   No item ${n} to take. Try \`look()\` to see what's here.`,
				styleFor(theme, 'dim')
			);
			return;
		}
		state.sceneItems[state.sceneId] = here.filter((_, i) => i !== n - 1);
		if (state.sceneItems[state.sceneId].length === 0) {
			delete state.sceneItems[state.sceneId];
		}
		state.inventory.push(itemId);
		logger.log(
			`%c   You take the ${itemDisplay(itemId)}.`,
			styleFor(theme, 'accent')
		);
	}

	function drop(n: number): void {
		if (!state) return;
		if (state.finished) return;
		const itemId = state.inventory[n - 1];
		if (!itemId) {
			logger.log(
				`%c   No item ${n} to drop. Try \`inventory()\` to see what you have.`,
				styleFor(theme, 'dim')
			);
			return;
		}
		state.inventory.splice(n - 1, 1);
		if (!state.sceneItems[state.sceneId]) state.sceneItems[state.sceneId] = [];
		state.sceneItems[state.sceneId].push(itemId);
		logger.log(
			`%c   You drop the ${itemDisplay(itemId)}.`,
			styleFor(theme, 'accent')
		);
	}

	function use(n: number): void {
		if (!state) return;
		if (state.finished) return;
		const itemId = state.inventory[n - 1];
		if (!itemId) {
			logger.log(
				`%c   No item ${n} to use. Try \`inventory()\`.`,
				styleFor(theme, 'dim')
			);
			return;
		}
		const item: ItemDef | undefined = config.items?.[itemId];
		const effect = item?.onUse;
		if (!effect) {
			logger.log(
				`%c   Nothing happens. The ${itemDisplay(itemId)} does what it does.`,
				styleFor(theme, 'dim')
			);
			return;
		}
		if (effect.inScenes && !effect.inScenes.includes(state.sceneId)) {
			logger.log(
				`%c   You can't use the ${itemDisplay(itemId)} here.`,
				styleFor(theme, 'dim')
			);
			return;
		}
		// Apply effects in this order: consume (so the inventory
		// numbering for any subsequent action is stable), points,
		// state effects, flavour text, then scene jump.
		if (effect.consumed) {
			state.inventory.splice(n - 1, 1);
		}
		if (typeof effect.points === 'number') {
			state.score += effect.points;
		}
		applyEffects(effect.effects);
		if (effect.text) {
			printResultCallout(effect.text);
		}
		// goTo: string advances (tracking visited), null finishes,
		// undefined stays put.
		if (effect.goTo !== undefined) {
			advanceTo(effect.goTo);
		}
	}

	function inventory(): void {
		if (!state) {
			logger.log(
				'%c   No game in progress. Boot it with `play()`.',
				styleFor(theme, 'dim')
			);
			return;
		}
		if (state.inventory.length === 0) {
			logger.log('%c   Your inventory is empty.', styleFor(theme, 'dim'));
			return;
		}
		logger.log(`%c   You're carrying:`, styleFor(theme, 'dim'));
		state.inventory.forEach((id, i) => {
			const item: ItemDef | undefined = config.items?.[id];
			const desc = item?.description ? ` — ${item.description}` : '';
			logger.log(
				`%c     ${i + 1}) %c${itemDisplay(id)}%c${desc}`,
				styleFor(theme, 'accent'),
				styleFor(theme, 'text'),
				styleFor(theme, 'dim')
			);
		});
		blank();
	}

	function look(): void {
		if (!state) return;
		printScene(state.sceneId);
	}

	function share(): void {
		if (!config.share) {
			logger.log(
				'%c   No share configured for this adventure.',
				styleFor(theme, 'dim')
			);
			return;
		}
		if (!state?.finished) {
			logger.log(
				'%c   Finish the game first — `play()`.',
				styleFor(theme, 'dim')
			);
			return;
		}
		const tier = tierFor(state.score);
		const text = config.share.text({ score: state.score, max: maxScore, tier });
		const url = config.share.url({ score: state.score, tier });
		const intent = (config.share.intent ?? buildXIntent)(text, url);

		config.onShare?.({ score: state.score, max: maxScore, tier });

		logger.log('%c   Opening share intent…', styleFor(theme, 'dim'));
		if (typeof window !== 'undefined') {
			window.open(intent, '_blank', 'noopener,noreferrer');
		}
	}

	function printScene(sceneId: string): void {
		const scene: Scene | undefined = config.scenes[sceneId];
		if (!scene) return;
		logger.log(`%c   ${scene.heading}`, styleSceneHeading(theme));
		blank();
		for (const line of scene.narration) {
			logger.log(`%c   ${line}`, styleNarration(theme));
		}

		// Items lying in this scene right now. Reads as a numbered
		// list so `pickup(n)` indexes into the same surface the
		// player just saw.
		const here = state?.sceneItems[sceneId] ?? [];
		if (here.length > 0) {
			blank();
			logger.log(`%c   You see:`, styleFor(theme, 'dim'));
			here.forEach((id, i) => {
				logger.log(
					`%c     ${i + 1}) ${itemDisplay(id)}`,
					styleFor(theme, 'info')
				);
			});
		}

		// Choices filtered by `requires`. Numbering tracks the
		// visible list so the player's `choose(n)` always matches
		// what they see on screen, even as items unlock options.
		const visible = visibleChoices(scene, state?.inventory ?? []);
		blank();
		visible.forEach(({ choice }, i) => {
			logger.log(`%c     ${i + 1}) ${choice.label}`, styleChoice(theme));
		});
		blank();
		// Prompt line mentions whichever verbs make sense right
		// now -- always `choose`, plus `pickup` when items are
		// on the floor, plus `inventory` once the player has
		// anything to look at.
		const verbs: string[] = [];
		if (visible.length > 0) verbs.push(`choose(1..${visible.length})`);
		if (here.length > 0) verbs.push(`pickup(1..${here.length})`);
		if ((state?.inventory.length ?? 0) > 0) verbs.push('inventory()');
		const prompt = verbs.length > 0 ? verbs.join(' · ') : 'no actions available';
		logger.log(`%c   > ${prompt}`, styleFor(theme, 'dim'));
		blank();
	}

	function printResultCallout(flavour: string): void {
		const rule = '──────────────────────────────────────────';
		blank();
		logger.log(`%c   ${rule}`, styleResultRule(theme));
		logger.log(
			`%c   ▶  %c${flavour}`,
			styleResultMarker(theme),
			styleResultText(theme)
		);
		logger.log(`%c   ${rule}`, styleResultRule(theme));
		blank();
	}

	function finish(): void {
		if (!state) return;
		state.finished = true;
		const score = state.score;
		const tier = tierFor(score);
		const tierColor = tierColorFor(score);

		const rule = '════════════════════════════════════════';
		logger.log(`%c   ${rule}`, styleBoldFor(theme, 'primary'));
		logger.log(`%c   FORGED. Score: ${score} / ${maxScore}`, styleFinish(theme));
		logger.log(`%c   Rank: ${tier}`, styleBoldFor(theme, tierColor));
		logger.log(`%c   ${rule}`, styleBoldFor(theme, 'primary'));
		blank();

		if (config.share) {
			logger.log('%c   Share your run:', styleFor(theme, 'dim'));
			logger.log('%c     > share()', styleBoldFor(theme, 'danger'));
			blank();
		}
		logger.log('%c   Or play again:', styleFor(theme, 'dim'));
		logger.log('%c     > play()', styleBoldFor(theme, 'primary'));
		blank();

		config.onComplete?.({ score, max: maxScore, tier });
	}

	function asShellPlugin(): ShellPlugin {
		// Helper for the numeric-argument commands. Same shape
		// across pickup/drop/use/choose -- pull args[0], reject
		// non-numbers loudly, otherwise dispatch.
		function asN(verb: string, handler: (n: number) => void) {
			return (...args: unknown[]) => {
				const n = Number(args[0]);
				if (!Number.isFinite(n)) {
					logger.log(
						`%c   \`${verb}(n)\` needs a number, e.g. ${verb}(1).`,
						styleFor(theme, 'dim')
					);
					return;
				}
				handler(n);
			};
		}

		return {
			attachTo(shell: Shell) {
				// Rebind logger and theme to the shell's so the
				// combined output reads as one consistent UI. The
				// adventure no longer uses its own configured
				// theme/logger after this point.
				logger = shell.logger;
				theme = shell.theme;

				shell.registerCommand('play', {
					description: `start the adventure (${maxScore} points to forge)`,
					color: 'primary',
					run: () => start()
				});
				shell.registerCommand('choose', {
					description: 'pick a numbered option mid-game',
					color: 'dim',
					run: asN('choose', choose)
				});
				// Item verbs are always registered; an adventure
				// without items just never surfaces them in any
				// scene's prompt line, so a curious player who
				// pokes at them gets the engine's "no item N" /
				// "your inventory is empty" reply.
				shell.registerCommand('pickup', {
					description: 'pick up an item from the current scene',
					color: 'accent',
					run: asN('pickup', pickup)
				});
				shell.registerCommand('drop', {
					description: 'drop an item from your inventory',
					color: 'accent',
					run: asN('drop', drop)
				});
				shell.registerCommand('use', {
					description: 'use an item from your inventory',
					color: 'accent',
					run: asN('use', use)
				});
				shell.registerCommand('inventory', {
					description: 'list what you are carrying',
					color: 'dim',
					run: () => inventory()
				});
				shell.registerCommand('look', {
					description: 'reprint the current scene',
					color: 'dim',
					run: () => look()
				});
				if (config.share) {
					shell.registerCommand('share', {
						description: 'share your finished run',
						color: 'danger',
						run: () => share()
					});
				}
			}
		};
	}

	return {
		maxScore,
		tierFor,
		start,
		choose,
		share,
		pickup,
		drop,
		use,
		look,
		inventory,
		getState: () => state,
		asShellPlugin
	};
}

// `computeMaxScore` used to live here. It now lives in
// `./score.ts` as a public export so the studio and any other
// downstream tool can compute scores without instantiating a
// runtime Adventure. This file imports the same function at
// the top.
