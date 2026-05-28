# console-adventure

> A branching choice-based text-adventure engine. Built on top of [`console-shell`](https://github.com/PaulNonatomic/console-shell) — shares its theme, logger, and style helpers. Plays out in any logger (the browser console by default).

`console-adventure` is a tiny dependency-free engine for choice-based interactive narratives. You declare a scene graph as a plain object; the engine handles state, scoring, branching, tier resolution, and an optional share intent. The output renders into any logger you supply — the browser console by default, but anything with `.log(msg, ...styles)` works.

[![CI](https://github.com/PaulNonatomic/console-adventure/actions/workflows/ci.yml/badge.svg)](https://github.com/PaulNonatomic/console-adventure/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-c7f441.svg)](./LICENSE)

<!-- npm badge will appear here once the package is published. -->
<!-- [![npm](https://img.shields.io/npm/v/console-adventure.svg)](https://www.npmjs.com/package/console-adventure) -->


---

## Why

The engine is the same one Nonatomic uses for the dev-console game on [nonatomic.co.uk](https://nonatomic.co.uk). It started life welded to the console; this package is the cleaned-up, logger-agnostic version. Use it for:

- A dev-tools easter egg (pair with [`console-shell`](https://github.com/PaulNonatomic/console-shell))
- An in-game narrative UI (give it a custom renderer instead of `console.log`)
- A terminal app via xterm.js or ink
- Headless interactive-fiction tests

One runtime dependency (`console-shell`, the shared substrate). ESM + CJS + types, ~5 KB gzipped on its own.

---

## Install

```bash
npm install console-adventure
# or
pnpm add console-adventure
# or
yarn add console-adventure
```

---

## Quick start — standalone

```ts
import { createAdventure } from 'console-adventure';

const adventure = createAdventure({
	start: 'entrance',
	scenes: {
		entrance: {
			heading: 'You stand at a fork.',
			narration: ['Two paths.'],
			choices: [
				{ label: 'Go left', points: 2, next: 'left' },
				{ label: 'Go right', points: 1, next: 'right' }
			]
		},
		left: {
			heading: 'A warm hall.',
			narration: ['It smells like solder.'],
			choices: [
				{ label: 'Continue', points: 2, flavour: 'You find the forge.', next: null }
			]
		},
		right: {
			heading: 'A cold hall.',
			narration: ['Humming.'],
			choices: [
				{ label: 'Continue', points: 1, flavour: 'You find the forge.', next: null }
			]
		}
	},
	tiers: [
		{ minScore: 4, label: 'Master', color: 'primary' },
		{ minScore: 0, label: 'Apprentice', color: 'dim' }
	],
	share: {
		text: ({ score, tier }) => `Forged ${tier} (${score}/4) at example.com.`,
		url: ({ score }) => `https://example.com/foundry?s=${score}`
	},
	onComplete: ({ score, tier }) => console.log(`done: ${tier} (${score})`)
});

// Drive it directly:
adventure.start();
adventure.choose(1);
adventure.choose(1);
adventure.share(); // opens X intent, only after finish
```

By default the engine renders into `console.log` with brand styling. Pass `logger: { log(msg, ...styles) }` in the config to render somewhere else.

---

## Quick start — plug into console-shell

```ts
import { createShell } from 'console-shell';
import { createAdventure } from 'console-adventure';

const game = createAdventure({ start: 'entrance', scenes: { /* ... */ } });

const shell = createShell({
	namespace: 'mybrand',
	banner: { wordmark: 'M Y B R A N D', hint: 'try mybrand.play()' }
});

shell.attach(game.asShellPlugin()); // → window.mybrand.play(), .choose(n), .share()
shell.install();
```

When attached, the adventure's theme and logger rebind to the shell's so the combined output reads as one consistent UI. The exposed namespace gets `.play()` (alias for `start()`), `.choose(n)`, and `.share()` if a `share:` config is present.

> **Layered on top of console-shell.** As of 0.2.0, `console-adventure` depends on [`console-shell`](https://github.com/PaulNonatomic/console-shell) for `Theme`, `Logger`, `DEFAULT_THEME`, and the style helpers — installing `console-adventure` pulls `console-shell` automatically. This deliberately removes the duplication that the earlier 0.1.0 release carried. The two packages still have separate concerns (one is a CLI surface, the other is a narrative engine), but the *shared substrate* — palette types, log contract, theme defaults — lives in one place. All the shared types are also re-exported from `console-adventure`, so `import { Theme, DEFAULT_THEME } from 'console-adventure'` still works without you touching console-shell directly.

---

## API

### `createAdventure(config: AdventureConfig): Adventure`

| Field          | Type                              | Notes                                                                       |
| -------------- | --------------------------------- | --------------------------------------------------------------------------- |
| `start`        | `string`                          | Scene id where the game begins. Throws if not in `scenes`.                  |
| `scenes`       | `Record<string, Scene>`           | Each `Scene = { heading, narration[], choices[] }`.                         |
| `tiers?`       | `Tier[]`                          | `{ minScore, label, color? }`. Resolver picks the highest qualifying tier.  |
| `share?`       | `ShareConfig`                     | Set this to enable `share()` after finish.                                  |
| `intro?`       | `string[]`                        | Lines printed once at the top of every `start()`.                           |
| `theme?`       | `Partial<Theme>`                  | Shallow-merged over `DEFAULT_THEME`. Overridden by the shell theme when bridged. |
| `logger?`      | `{ log(msg, ...styles) }`         | Defaults to `console`. Tests pass a capturing stub.                         |
| `onStart?`     | `() => void`                      | Fires every `start()`. No dedupe — that's your job if you want it.          |
| `onComplete?`  | `(args) => void`                  | Fires when a `null`-`next` choice is selected. Includes `{score,max,tier}`. |
| `onShare?`     | `(args) => void`                  | Fires when `share()` is invoked post-finish.                                |

The returned `Adventure` exposes:

- `start()` — start (or restart) the game.
- `choose(n)` — pick option `n` (1-indexed) in the current scene.
- `share()` — open the share intent; no-ops with a hint pre-finish.
- `getState()` — `{ sceneId, score, finished } | null` for inspection / tests.
- `maxScore` — max achievable across all paths (DFS-computed, reconvergence-aware).
- `tierFor(score)` — resolve a tier label for a score.
- `asShellPlugin()` — return a `{ attachTo(shell) }` adapter for `console-shell`.

### Branching

Each `Choice` declares its own `next: string | null`:

```ts
choices: [
	{ label: 'Take the left door', points: 2, next: 'left' },
	{ label: 'Take the right door', points: 2, next: 'right' }
]
```

Two scenes both pointing to a third reconverge cleanly — the `maxScore` resolver walks the graph with memoised DFS so reconverging branches aren't double-counted.

### Theme

`DEFAULT_THEME` ships a phosphor-on-void palette (lime + amber + magenta + cyan on near-black). Override any field via `theme:` in config, or rely on the shell's theme when bridged. Slot names: `primary`, `accent`, `danger`, `info`, `text`, `dim`.

### Share intents

The default `share()` opens `https://twitter.com/intent/tweet`. Override `share.intent` to target a different platform — `buildMastodonIntent` and `buildBlueskyIntent` are provided:

```ts
import { buildMastodonIntent } from 'console-adventure';

createAdventure({
	// ...
	share: {
		text: (a) => `Forged ${a.tier}.`,
		url: (a) => `https://example.com/${a.score}`,
		intent: (text, url) => buildMastodonIntent(text, url, 'mas.to')
	}
});
```

### Analytics

The library is analytics-agnostic. Wire `onStart` / `onComplete` / `onShare` into whatever you use:

```ts
createAdventure({
	// ...
	onComplete: ({ score, tier }) =>
		analytics.track('adventure_completed', { score, tier })
});
```

Hooks fire raw — no built-in dedupe. Wrap with `sessionStorage` if you want once-per-session-per-event semantics.

---

## Loading an adventure from JSON

If you'd rather author narratives as data than as TypeScript object literals — useful for storing adventures in a CMS, hot-loading user-generated content, or feeding the output of a visual editor — `createAdventureFromJson` consumes a JSON-shaped config:

```ts
import { createAdventureFromJson } from 'console-adventure';

const adventure = createAdventureFromJson(
	await fetch('/foundry.json').then((r) => r.json()),
	{
		// hooks + theme + logger stay code-side, passed as `extras`
		onComplete: ({ score, tier }) => analytics.track('done', { score, tier })
	}
);
```

The JSON shape mirrors `AdventureConfig` with three concessions for serialisability:

```json
{
	"$schema": "https://raw.githubusercontent.com/PaulNonatomic/console-adventure/main/adventure.schema.json",
	"start": "entrance",
	"scenes": { /* same shape as TS — heading, narration, choices */ },
	"tiers": [{ "minScore": 8, "label": "Master", "color": "primary" }],
	"share": {
		"text": "Forged ${tier} (${score}/${max}) at example.com",
		"url":  "https://example.com/foundry?s=${score}",
		"intent": "x"
	},
	"intro": ["..."]
}
```

| JSON field          | What it becomes at runtime                                                  |
| ------------------- | --------------------------------------------------------------------------- |
| `share.text`        | Function that interpolates `${score}` / `${max}` / `${tier}`                |
| `share.url`         | Function that interpolates `${score}` / `${tier}`                           |
| `share.intent`      | Preset string: `"x"` (default), `"bluesky"`, `"mastodon"`, `"mastodon:host.tld"` |
| `onStart` etc.      | **Not in JSON** — pass via the `extras` arg                                 |
| `theme`, `logger`   | **Not in JSON** — pass via the `extras` arg                                 |

A canonical JSON Schema ships at the package root (`adventure.schema.json`) for IDE autocomplete, validators, and the upcoming `console-adventure-studio` visual editor.

A working JSON foundry example sits in [`examples/foundry/foundry.json`](./examples/foundry/foundry.json) alongside the TypeScript version.

---

## Standalone vs bridged

The engine works either way:

| Need                                            | Use                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| Game in the browser dev tools, with a banner    | This package + [`console-shell`](https://github.com/PaulNonatomic/console-shell) via `asShellPlugin()` |
| Game in a custom in-page UI                     | This package standalone, pass a custom `logger:`                     |
| Game in a terminal (xterm.js / blessed / ink)   | This package standalone, pass a logger that writes to the terminal   |
| Game logic only, drive your own renderer        | This package standalone, ignore the styles, use `getState()`         |

---

## Examples

A full Foundry-style adventure ships in [`examples/foundry/`](./examples/foundry/) — open `index.html` in a browser, pop dev tools, type `foundry.start()`.

---

## Dev

```bash
npm install
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run build      # tsup → dist/
```

---

## License

MIT © Paul Stamp / [Nonatomic Digital Foundry](https://nonatomic.co.uk).

---

## See also

- [`console-shell`](https://github.com/PaulNonatomic/console-shell) — the companion CLI shell. Pair them via `asShellPlugin()`.
- [nonatomic.co.uk](https://nonatomic.co.uk) — open dev tools, type `nonatomic.play()`.
