# Changelog

All notable changes to this project will be documented in this file. The format
is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.5.0] — Unreleased

### Added

- Items + inventory system. Adventures can declare a top-level `items`
  catalogue keyed by item id; scenes carry an `items?` list of item ids
  present at the start of a run; choices carry optional `requires` / `consumes`
  / `grants` arrays to gate, consume, or grant items. Five new runtime verbs
  on `Adventure`: `pickup(n)`, `drop(n)`, `use(n)`, `inventory()`, `look()`.
- `ItemDef` + `ItemUseEffect` types exported. An item's optional `onUse` field
  fires on `use(n)` — supports flavour text, score delta, scene jump (or
  `null` to finish), `inScenes` restriction, and `consumed` for single-use
  items.
- `AdventureState` now includes `inventory: string[]` and `sceneItems:
  Record<string, string[]>` so callers can introspect the run's item state
  alongside `sceneId` / `score` / `finished`.
- The shell plugin now registers `pickup`, `drop`, `use`, `inventory`, and
  `look` commands alongside the existing `play` / `choose` / `share`. Always
  registered, even when the adventure has no items — a curious player gets
  the engine's "no item N" / "your inventory is empty" reply rather than an
  unknown-command error.

### Changed

- `printScene` now renders a "You see:" item list when the current scene has
  items, and filters the choice list by `requires` -- a choice whose
  requirements aren't met is HIDDEN, not greyed. `choose(n)` indexes into the
  visible list so the numbering the player sees always matches the engine.
- The prompt line under each scene names whichever verbs make sense right
  now -- always `choose`, plus `pickup` when items are on the floor, plus
  `inventory()` once the player has anything.

## [0.4.0] — Unreleased

### Added

- `computeMaxScore(graph)` exported as a public helper. Memoised DFS over the
  scene graph; same algorithm the runtime `Adventure` uses internally, now
  available without instantiating a runtime instance — so editors and tooling
  can compute scores without spinning up a `Logger`. Accepts both the runtime
  `AdventureConfig` and the wire-format `AdventureJson` structurally via a
  `ScoreableGraph` shape.
- `tierFor(score, tiers, fallback?)` exported as a public helper. Pure
  function — resolves the highest qualifying tier label for a score against
  any tier table. Used internally by `createAdventure(...).tierFor()` so both
  call paths return identical answers.
- `ScoreableGraph` type exported alongside, so downstream consumers can
  declare functions that accept either flavour of adventure config.

### Fixed

- `computeMaxScore` no longer stack-overflows on cyclic narratives. Seeds the
  cache with `0` for the in-progress scene before descending, so a recursive
  call that loops back short-circuits. Non-cyclic graphs see no behavioural
  change; previously the DFS would recurse forever and crash.

### Internal

- `createAdventure(...)` delegates its private max-score DFS and tier-label
  resolver to the new public helpers. One implementation, two call sites.

## [0.3.0] — Unreleased

### Added

- `createAdventureFromJson(json, extras?)` — build an `Adventure` from a
  JSON-shaped config. The `share.text` and `share.url` fields are template
  strings with `${score}` / `${max}` / `${tier}` placeholders the engine
  compiles to functions at load time. `share.intent` becomes a preset string:
  `"x"` (default), `"bluesky"`, `"mastodon"`, or `"mastodon:instance.tld"`
  to target a specific Mastodon host.
- `AdventureJson`, `JsonShareConfig`, `AdventureExtras` exported as types
  so authors can declare and pass JSON configs with full IDE support.
- `adventure.schema.json` shipped at the package root — a draft-07 JSON
  Schema that editors / IDEs / the upcoming `console-adventure-studio`
  tool can validate against and use for autocomplete. Reference it from a
  config via the standard `$schema` field.
- Foundry example now ships in two forms: TypeScript (`scenes.ts`) and
  JSON (`foundry.json`).

### Notes

The runtime `AdventureConfig` still takes functions; JSON support is a
sibling loader, not a replacement. Hooks (`onStart` / `onComplete` /
`onShare`) and the `theme` / `logger` overrides can't ride over JSON for
obvious reasons (functions don't serialise) — they're passed as a second
`extras` arg to `createAdventureFromJson` so analytics + custom rendering
stay code-side.

## [0.2.0] — Unreleased

### Changed

- **Layered on top of `console-shell`.** The 0.1.0 release shipped its own
  copy of `Theme`, `Logger`, `DEFAULT_THEME`, `resolveTheme`, and the small
  style helpers — duplicating the same surface that already lived in
  `console-shell`. From 0.2.0, `console-adventure` declares
  `console-shell` as a runtime dependency and imports those types and
  helpers from it. The structural `ShellLike` / `ShellPluginLike` workaround
  is gone; `asShellPlugin()` now returns the real `ShellPlugin` from
  `console-shell`. All shared types are still re-exported from
  `console-adventure` so consumers don't have to import from
  `console-shell` directly unless they want to.
- The `Logger` type imported here matches `console-shell`'s rename from
  `ShellLogger` → `Logger` (also 0.2.0 on that side).

### Removed

- `src/theme.ts` (now re-exported from `console-shell`).
- Duplicated `Theme`, `ThemeColor`, `Logger` from `src/types.ts` (same).
- `ShellLike`, `ShellPluginLike` from `src/adventure.ts` (replaced by
  `Shell`, `ShellPlugin` imported from `console-shell`).

## [0.1.0] — Unreleased

Initial release.

### Added

- `createAdventure(config)` — branching choice-based scene-graph engine.
  Pure data model: scenes keyed by id, each choice declaring its own
  `next` scene pointer (or `null` to finish). Optional per-choice scoring,
  DFS-based max-score resolution that handles reconverging branches, and an
  optional tier table for finish ranks.
- Standalone API: `start()`, `choose(n)`, `share()`, `getState()`, `tierFor()`,
  `maxScore`. Drives any consumer-supplied logger.
- `asShellPlugin()` adapter for plugging into
  [`console-shell`](https://github.com/PaulNonatomic/console-shell) (or any
  structurally-compatible shell). Rebinds the engine's theme + logger to the
  shell's at attach time.
- Built-in share-intent builders for X (Twitter), Mastodon, and Bluesky.
  Consumers can supply their own builder for other platforms.
- `DEFAULT_THEME` + `resolveTheme(partial)` — phosphor-on-void palette,
  same shape as console-shell's.
- vitest test suite covering scoring math (DFS, tier resolution, fallbacks),
  standalone playthroughs (both branches), pre/post-finish share guards, and
  the asShellPlugin adapter (command registration, argument coercion).
- Foundry example replicating Nonatomic's full dev-console adventure.

### Notes

The branching narrative engine was first shipped as part of the
`console-quest` package (now renamed to
[`console-shell`](https://github.com/PaulNonatomic/console-shell)). It was
split into its own package so that:

- the shell can be adopted on its own for a pure easter egg,
- the engine can be used outside the browser console (in-game UI, terminal
  apps via xterm.js, headless tests),
- each library has a sharper purpose.

This is a fresh repository — the git history of the engine before this split
is preserved over in `console-shell`'s history.
