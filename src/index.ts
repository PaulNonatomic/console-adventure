/**
 * console-adventure — branching choice-based text-adventure
 * engine. Plays out in any logger (the browser console by
 * default), and pairs cleanly with the companion
 * `console-shell` package for the easter-egg use case.
 *
 * Public API:
 *   - `createAdventure(config)`   — scene graph runner
 *   - `DEFAULT_THEME`             — phosphor-on-void palette
 *   - `resolveTheme(partial)`     — merge a partial over defaults
 *   - Share intent builders for X / Mastodon / Bluesky
 *
 * Types are re-exported as type-only so consumers can declare
 * configs with full IDE support without the runtime cost of
 * importing the implementation modules.
 */

export { createAdventure } from './adventure.js';
export type {
	Adventure,
	AdventureState,
	ShellLike,
	ShellPluginLike
} from './adventure.js';

export { DEFAULT_THEME, resolveTheme } from './theme.js';

export {
	buildXIntent,
	buildMastodonIntent,
	buildBlueskyIntent
} from './share.js';

export type {
	Theme,
	ThemeColor,
	Logger,
	Choice,
	Scene,
	Tier,
	ShareConfig,
	AdventureConfig
} from './types.js';
