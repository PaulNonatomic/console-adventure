/**
 * Adventure-specific types. Theme / ThemeColor / Logger live
 * in console-shell — we re-export them from `./index` so a
 * consumer who's only using console-adventure can still pull
 * them with `import { Theme } from 'console-adventure'`.
 */

/**
 * One option presented to the player in a scene. The chosen
 * option's `points` (if any) is added to the player's score,
 * its `flavour` is printed as a result callout, then the game
 * advances to the scene named in `next` (or finishes if `next`
 * is `null`).
 */
/** Comparison operators for numeric conditions. */
export type CompareOp = '==' | '!=' | '>=' | '<=' | '>' | '<';

/**
 * A predicate evaluated against the run's live state
 * (variables, inventory, score, visited scenes). Conditions
 * gate branch transitions. The `kind` discriminator keeps the
 * set extensible — new condition types slot in without
 * touching existing ones.
 */
export type Condition =
	| {
			/** Inventory contains (or, with `negate`, lacks) `item`. */
			kind: 'hasItem';
			item: string;
			negate?: boolean;
	  }
	| {
			/** A state variable compared to a constant. Unset vars read as 0. */
			kind: 'var';
			var: string;
			op: CompareOp;
			value: number;
	  }
	| {
			/** The player's running score compared to a constant. */
			kind: 'score';
			op: CompareOp;
			value: number;
	  }
	| {
			/** Player has (or, with `negate`, has not) visited `scene`. */
			kind: 'visited';
			scene: string;
			negate?: boolean;
	  };

/**
 * A mutation to a state variable, applied when a choice is
 * picked or an item is used. `set` replaces the value; `add`
 * increments by `value` (negative to decrement). A flag is
 * just a variable set to 1 / 0.
 */
export interface StateEffect {
	var: string;
	op: 'set' | 'add';
	value: number;
}

/**
 * A guarded transition. When a choice is picked, its `branches`
 * are evaluated in order; the first branch whose `when`
 * conditions ALL hold wins, and the game advances to that
 * branch's `goTo`. If no branch matches, the choice's plain
 * `next` is used as the fallback. This is how a single choice
 * routes to scene A when a condition holds and scene B
 * otherwise.
 */
export interface ChoiceBranch {
	/** Conditions, all ANDed. An empty array always matches. */
	when: Condition[];
	/** Destination when this branch wins. `null` finishes the game. */
	goTo: string | null;
}

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
	/**
	 * Item ids the player must hold for this choice to appear.
	 * When set, the engine hides the choice from the rendered
	 * options list until every required item is in the player's
	 * inventory. Studio surfaces all choices for authoring; only
	 * the runtime hides them.
	 */
	requires?: string[];
	/**
	 * Item ids removed from the inventory when this choice is
	 * picked. Order is preserved; ids the player isn't holding
	 * are silently ignored (so consume-list authoring stays
	 * straightforward even when paths reconverge).
	 */
	consumes?: string[];
	/**
	 * Item ids granted (added to inventory) when this choice is
	 * picked. Duplicates of an item the player already has are
	 * appended -- inventory is a multiset of ids.
	 */
	grants?: string[];
	/**
	 * State mutations applied when this choice is picked (set /
	 * add a variable). Run before the transition is resolved, so
	 * a branch on the same choice can read the value this choice
	 * just set.
	 */
	effects?: StateEffect[];
	/**
	 * Conditional transitions. Evaluated in order; the first
	 * branch whose conditions all hold determines the next
	 * scene. Falls back to `next` when none match. Omit for a
	 * plain unconditional choice.
	 */
	branches?: ChoiceBranch[];
}

/** A single beat in the narrative. */
export interface Scene {
	/** Heading shown in primary, e.g. `"~/foundry · entrance"`. */
	heading: string;
	/** Lines of body text. Each entry is one logger.log line. */
	narration: string[];
	/** Choices the player can pick via `choose(n)`. */
	choices: Choice[];
	/**
	 * Items present in the scene at the start of a run. Players
	 * can `pickup(n)` them; dropped items also accumulate here
	 * so the scene state stays consistent. Per-run mutable state
	 * lives in `AdventureState.sceneItems`; this field is the
	 * static seed.
	 */
	items?: string[];
}

/**
 * Effects fired when the player invokes `use(n)` on an item in
 * their inventory. Mirrors a Choice's effect shape on purpose
 * (points, flavour, scene jump) so authoring an interactive
 * item feels like authoring a self-contained choice attached to
 * the item rather than to a scene.
 */
export interface ItemUseEffect {
	/**
	 * Scenes where the item can be used. Omit for "anywhere";
	 * supply an array to restrict use to specific scenes. When
	 * the player tries to use the item in a scene that isn't on
	 * the list, the engine prints a dim "you can't use that
	 * here" line and changes nothing.
	 */
	inScenes?: string[];
	/** Flavour text printed when the item is used. */
	text?: string;
	/** Score delta on use. */
	points?: number;
	/**
	 * Scene jump on use. `string` = id to advance to;
	 * `null` = finish the game. Omit to stay in the current
	 * scene.
	 */
	goTo?: string | null;
	/**
	 * If true, the item is removed from the inventory after a
	 * successful use. Defaults to false -- the item stays so the
	 * player can use it multiple times.
	 */
	consumed?: boolean;
	/**
	 * State mutations applied when the item is used. Lets an
	 * item set a flag / bump a counter the rest of the
	 * adventure can branch on — this is how "use the lantern"
	 * can light a flag that unlocks a later path.
	 */
	effects?: StateEffect[];
}

/**
 * Catalogue entry for an item. Items are referenced by their
 * key in `AdventureConfig.items` from scenes (`Scene.items`),
 * choices (`Choice.requires/consumes/grants`), and the player's
 * inventory. The catalogue is the canonical source for display
 * names + descriptions; scenes / choices only carry the keys.
 */
export interface ItemDef {
	/** Player-facing display name. */
	name: string;
	/** Optional longer description shown by `inventory()`. */
	description?: string;
	/**
	 * What happens when the player runs `use(n)` on this item.
	 * Omit entirely for a flavour-only item -- using it then
	 * prints a generic "nothing happens" line.
	 */
	onUse?: ItemUseEffect;
}

/**
 * Score-to-label mapping for the end-of-game tier. Listed in
 * any order; the resolver picks the highest qualifying entry.
 * `color` is a theme-slot name (`'primary' | 'accent' | ...`)
 * — uses the ThemeColor type from console-shell.
 */
export interface Tier {
	minScore: number;
	label: string;
	color?: import('console-shell').ThemeColor;
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
	 * `DEFAULT_THEME` from console-shell. When attached to a
	 * shell via `asShellPlugin()`, the bridge swaps this for
	 * the shell's theme at attach time.
	 */
	theme?: Partial<import('console-shell').Theme>;
	/**
	 * Logger to write rendered output through. Defaults to
	 * `console`. Tests pass a capturing stub.
	 */
	logger?: import('console-shell').Logger;
	/**
	 * Optional analytics hooks. Each fires exactly once per
	 * trigger (no stateful dedupe across replays — that's the
	 * consumer's job, if they want it).
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
	/**
	 * Item catalogue. Each entry is referenced by its key from
	 * `Scene.items`, `Choice.requires/consumes/grants`, and the
	 * player's inventory at runtime. Omit entirely for an
	 * adventure with no inventory mechanics.
	 */
	items?: Record<string, ItemDef>;
	/**
	 * Starting values for tracked state variables. Seeded into
	 * `AdventureState.state` on each `start()`. Variables not
	 * listed here read as 0 the first time a condition checks
	 * them, so this is only needed when a non-zero starting
	 * value matters.
	 */
	initialState?: Record<string, number>;
}
