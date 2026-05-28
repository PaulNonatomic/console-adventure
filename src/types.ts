/**
 * Public types for console-adventure.
 *
 * Includes a small `Theme` + `Logger` of its own — structurally
 * identical to console-shell's but kept independent so the
 * adventure engine works standalone, without any awareness of
 * the shell package. The `bridgeToShell()` helper exported from
 * `./bridge` handles the (trivial) mapping when both packages
 * are used together.
 */

/**
 * Theme palette used when rendering scenes via the default
 * console logger. Same shape as console-shell's Theme so
 * bridging is a pass-through. Every field is a CSS string.
 */
export interface Theme {
	primary: string;
	accent: string;
	danger: string;
	info: string;
	text: string;
	dim: string;
	fontFamily: string;
	fontSize: string;
}

export type ThemeColor = 'primary' | 'accent' | 'danger' | 'info' | 'text' | 'dim';

/**
 * Minimal logger contract — every output the engine makes goes
 * through `.log(message, ...styles)`. `console` satisfies this
 * directly; tests pass a capturing stub.
 */
export interface Logger {
	log: (message: string, ...styles: string[]) => void;
}

/**
 * One option presented to the player in a scene. The chosen
 * option's `points` (if any) is added to the player's score,
 * its `flavour` is printed as a result callout, then the game
 * advances to the scene named in `next` (or finishes if `next`
 * is `null`).
 */
export interface Choice {
	/** Display text shown after the choice index. */
	label: string;
	/**
	 * Score added on selection. Omit for a no-score narrative.
	 * Mixed scoring across choices is fine.
	 */
	points?: number;
	/**
	 * Result text rendered in a callout after the choice is
	 * selected — the "what just happened" line. Skipped if
	 * absent (the game advances straight to the next scene).
	 */
	flavour?: string;
	/**
	 * Next scene id, or `null` to end the game. Branching
	 * narratives use this; linear narratives can keep the same
	 * `next` across all of a scene's choices.
	 */
	next: string | null;
}

/** A single beat in the narrative. */
export interface Scene {
	/** Heading shown in primary, e.g. `"~/foundry · entrance"`. */
	heading: string;
	/** Lines of body text. Each entry is one logger.log line. */
	narration: string[];
	/** Choices the player can pick via `choose(n)`. */
	choices: Choice[];
}

/**
 * Score-to-label mapping for the end-of-game tier. Listed in
 * any order; the resolver picks the highest qualifying entry.
 */
export interface Tier {
	minScore: number;
	label: string;
	color?: ThemeColor;
}

/**
 * Share configuration. When present and the player has
 * finished, `share()` builds the URL and opens it via
 * `window.open` (or via a user-supplied open handler).
 */
export interface ShareConfig {
	/** Pre-filled post text. */
	text: (args: { score: number; max: number; tier: string }) => string;
	/** URL appended to the post (usually a brag landing page). */
	url: (args: { score: number; tier: string }) => string;
	/**
	 * Build the share intent URL given the text + url. Defaults
	 * to X (Twitter) intent. Override for Mastodon / Bluesky /
	 * LinkedIn / custom share endpoints.
	 */
	intent?: (text: string, url: string) => string;
}

export interface AdventureConfig {
	/** Scene id where `start()` begins. */
	start: string;
	/** Scene graph keyed by scene id. */
	scenes: Record<string, Scene>;
	/**
	 * Tier table. Optional — without tiers the finish callout
	 * shows just the raw score.
	 */
	tiers?: Tier[];
	/** Share intent configuration. Omit to disable `share()`. */
	share?: ShareConfig;
	/**
	 * Theme used by the built-in renderer. Falls back to
	 * `DEFAULT_THEME`. When bridged onto a console-shell, the
	 * bridge can swap this for the shell's theme at attach
	 * time.
	 */
	theme?: Partial<Theme>;
	/**
	 * Logger to write rendered output through. Defaults to
	 * `console`. Tests pass a capturing stub.
	 */
	logger?: Logger;
	/**
	 * Optional analytics hooks. Each fires at most once per
	 * `start()` call (no stateful dedupe across replays —
	 * that's the consumer's job, if they want it).
	 */
	onStart?: () => void;
	onComplete?: (args: { score: number; max: number; tier: string }) => void;
	onShare?: (args: { score: number; max: number; tier: string }) => void;
	/**
	 * Optional intro printed once before the first scene on
	 * each `start()` call. Use it to tell the player how to
	 * play.
	 */
	intro?: string[];
}
