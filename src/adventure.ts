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
	Scene,
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
	 * Return a console-shell `ShellPlugin` that registers the
	 * play / choose / share commands on a shell. Calling
	 * `attachTo(shell)` rebinds the adventure's logger and
	 * theme to the shell's at attach time, so the combined
	 * output reads as one consistent UI.
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
		state = { sceneId: config.start, score: 0, finished: false };
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
		const choice: Choice | undefined = scene?.choices[n - 1];
		if (!scene || !choice) {
			logger.log(
				`%c   Choice ${n} not available — pick 1–${scene?.choices.length ?? 0}.`,
				styleFor(theme, 'dim')
			);
			return;
		}

		state.score += choice.points ?? 0;
		if (choice.flavour) {
			printResultCallout(choice.flavour);
		}

		if (choice.next === null) {
			finish();
		} else {
			state.sceneId = choice.next;
			printScene(state.sceneId);
		}
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
		blank();
		scene.choices.forEach((choice, i) => {
			logger.log(`%c     ${i + 1}) ${choice.label}`, styleChoice(theme));
		});
		blank();
		logger.log(
			`%c   > choose(1..${scene.choices.length})`,
			styleFor(theme, 'dim')
		);
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
					run: (...args: unknown[]) => {
						const n = Number(args[0]);
						if (!Number.isFinite(n)) {
							logger.log(
								'%c   `choose(n)` needs a number, e.g. choose(1).',
								styleFor(theme, 'dim')
							);
							return;
						}
						choose(n);
					}
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
		getState: () => state,
		asShellPlugin
	};
}

// `computeMaxScore` used to live here. It now lives in
// `./score.ts` as a public export so the studio and any other
// downstream tool can compute scores without instantiating a
// runtime Adventure. This file imports the same function at
// the top.
