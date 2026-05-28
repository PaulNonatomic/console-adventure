/**
 * JSON-config support for `createAdventure`.
 *
 * The runtime `AdventureConfig` accepts functions for
 * `share.text`, `share.url`, `share.intent`, and the analytics
 * hooks. None of those round-trip cleanly through JSON.
 *
 * This module bridges the gap:
 *   - share text + url become template strings with
 *     `${score}` / `${max}` / `${tier}` placeholders
 *   - share intent becomes a preset string ("x" | "bluesky" |
 *     "mastodon" | "mastodon:instance.tld")
 *   - hooks (onStart / onComplete / onShare) + theme + logger
 *     stay code-side, passed in via the second arg
 *
 * `createAdventureFromJson(json, extras?)` validates the
 * minimum required fields, compiles the templates, resolves
 * the intent preset, and hands the assembled config to
 * `createAdventure`.
 *
 * For tooling (the upcoming console-adventure-studio editor,
 * IDE schema-aware autocompletion, etc.), the canonical JSON
 * Schema ships alongside as `adventure.schema.json` and is
 * referenced by URL in the `$schema` field of any exported
 * config.
 */
import type {
	AdventureConfig,
	ShareConfig,
	Scene,
	Tier
} from './types.js';
import type { Adventure } from './adventure.js';
import { createAdventure } from './adventure.js';
// `buildXIntent` isn't imported here on purpose — when the
// JSON `share.intent` preset is `"x"` (or omitted) we return
// `undefined` from `resolveIntent()` so the runtime falls
// through to its own X-default in `adventure.ts`. Only the
// non-X presets get explicit builders.
import { buildMastodonIntent, buildBlueskyIntent } from './share.js';

/**
 * Wire-format shape of an adventure. Same as `AdventureConfig`
 * except `share` carries templates + a preset instead of
 * functions, and the code-only fields (theme/logger/hooks) are
 * absent — they get provided separately via the `extras` arg
 * to `createAdventureFromJson`.
 */
export interface AdventureJson {
	/** Optional JSON Schema reference, ignored by the runtime. */
	$schema?: string;
	start: string;
	scenes: Record<string, Scene>;
	tiers?: Tier[];
	share?: JsonShareConfig;
	intro?: string[];
}

export interface JsonShareConfig {
	/**
	 * Template string for the share post body. Placeholders:
	 *   ${score}  the player's final score
	 *   ${max}    the adventure's max score
	 *   ${tier}   the resolved tier label
	 */
	text: string;
	/**
	 * Template string for the share URL. Placeholders:
	 *   ${score}  the player's final score
	 *   ${tier}   the resolved tier label
	 */
	url: string;
	/**
	 * Share-platform preset. Defaults to `"x"` (Twitter intent).
	 * Mastodon defaults to mastodon.social; pass
	 * `"mastodon:mas.to"` to target a different instance.
	 */
	intent?: 'x' | 'twitter' | 'bluesky' | 'mastodon' | `mastodon:${string}`;
}

/**
 * Code-only additions to a JSON-defined adventure: hooks,
 * theme, logger. These can't ride over JSON for obvious
 * reasons (functions don't serialise), so they're separate.
 */
export type AdventureExtras = Pick<
	AdventureConfig,
	'theme' | 'logger' | 'onStart' | 'onComplete' | 'onShare'
>;

/**
 * Build an `Adventure` from a JSON-shaped config. Compiles
 * `share.text` / `share.url` template strings to functions and
 * resolves the `share.intent` preset to a real URL builder,
 * then forwards to `createAdventure`.
 */
export function createAdventureFromJson(
	json: AdventureJson,
	extras?: AdventureExtras
): Adventure {
	validate(json);

	const config: AdventureConfig = {
		start: json.start,
		scenes: json.scenes,
		...(json.tiers && { tiers: json.tiers }),
		...(json.intro && { intro: json.intro }),
		...(extras ?? {})
	};

	if (json.share) {
		config.share = compileShare(json.share);
	}

	return createAdventure(config);
}

/**
 * Minimal runtime validation. Doesn't try to be a full JSON
 * Schema validator — that's what `adventure.schema.json` and
 * an editor / IDE are for. We just catch the loudest errors so
 * a malformed JSON gives a useful message instead of an
 * undefined-property crash deep inside the renderer.
 */
function validate(json: unknown): asserts json is AdventureJson {
	if (typeof json !== 'object' || json === null) {
		throw new Error('[console-adventure] JSON config must be an object.');
	}
	const j = json as Partial<AdventureJson>;
	if (typeof j.start !== 'string' || j.start.length === 0) {
		throw new Error('[console-adventure] JSON config missing required field "start".');
	}
	if (typeof j.scenes !== 'object' || j.scenes === null) {
		throw new Error('[console-adventure] JSON config missing required field "scenes".');
	}
	if (!j.scenes[j.start]) {
		throw new Error(
			`[console-adventure] start scene "${j.start}" is not in the scenes map.`
		);
	}
	if (j.share && (typeof j.share.text !== 'string' || typeof j.share.url !== 'string')) {
		throw new Error(
			'[console-adventure] share.text and share.url must both be strings (templates).'
		);
	}
}

/**
 * Compile a share JSON sub-config to the runtime ShareConfig
 * with real functions for `text`, `url`, and (optionally)
 * `intent`.
 */
function compileShare(share: JsonShareConfig): ShareConfig {
	const text = compileTemplate<{ score: number; max: number; tier: string }>(
		share.text
	);
	const url = compileTemplate<{ score: number; tier: string }>(share.url);
	const intent = resolveIntent(share.intent);
	return intent ? { text, url, intent } : { text, url };
}

/**
 * Turn a `"${score} of ${max}"`-style template into a function
 * that swaps placeholders for the args object's values. Unknown
 * placeholders render as empty string so a typo in the template
 * is loud-but-not-fatal.
 */
function compileTemplate<TArgs extends Record<string, string | number>>(
	template: string
): (args: TArgs) => string {
	return (args: TArgs) =>
		template.replace(/\$\{(\w+)\}/g, (_, key) => {
			const value = args[key as keyof TArgs];
			return value === undefined ? '' : String(value);
		});
}

/**
 * Resolve a `share.intent` preset string to the corresponding
 * intent-URL builder. `undefined` means "use the runtime
 * default" (X / Twitter); a recognised preset returns the
 * specific builder; an unknown preset throws so a typo in the
 * JSON is caught early.
 */
function resolveIntent(
	preset: JsonShareConfig['intent']
): ((text: string, url: string) => string) | undefined {
	if (preset === undefined || preset === 'x' || preset === 'twitter') {
		// Default — return undefined so ShareConfig.intent stays
		// unset and the runtime falls through to buildXIntent.
		return undefined;
	}
	if (preset === 'bluesky') return buildBlueskyIntent;
	if (preset === 'mastodon') {
		return (text, url) => buildMastodonIntent(text, url);
	}
	if (preset.startsWith('mastodon:')) {
		const instance = preset.slice('mastodon:'.length);
		return (text, url) => buildMastodonIntent(text, url, instance);
	}
	throw new Error(
		`[console-adventure] Unknown share intent preset: "${preset}". ` +
			`Expected one of: "x", "twitter", "bluesky", "mastodon", "mastodon:host".`
	);
}
