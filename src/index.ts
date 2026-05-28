/**
 * console-adventure — branching choice-based text-adventure
 * engine. Built on top of `console-shell`: shares its Theme,
 * Logger, DEFAULT_THEME, and the style helpers. Use either
 * standalone (drive `createAdventure` directly into your own
 * logger) or attached to a shell via `asShellPlugin()`.
 *
 * Public API:
 *   - `createAdventure(config)`   — scene graph runner
 *   - Share intent builders for X / Mastodon / Bluesky
 *
 * Shared types and helpers are re-exported from `console-shell`
 * so a consumer using only `console-adventure` can still pull
 * them with `import { Theme, DEFAULT_THEME } from 'console-adventure'`.
 */

export { createAdventure } from './adventure.js';
export type { Adventure, AdventureState } from './adventure.js';

export { createAdventureFromJson } from './json.js';
export type {
	AdventureJson,
	JsonShareConfig,
	AdventureExtras
} from './json.js';

// Re-export the shared types + helpers from console-shell so
// consumers of console-adventure can import them from a single
// place. console-shell remains the source of truth — anything
// changed there appears here automatically next install.
export {
	DEFAULT_THEME,
	resolveTheme,
	colorFor,
	styleFor,
	styleBoldFor
} from 'console-shell';
export type {
	Theme,
	ThemeColor,
	Logger,
	Shell,
	ShellPlugin
} from 'console-shell';

export {
	buildXIntent,
	buildMastodonIntent,
	buildBlueskyIntent
} from './share.js';

export type {
	Choice,
	Scene,
	Tier,
	ShareConfig,
	AdventureConfig
} from './types.js';
