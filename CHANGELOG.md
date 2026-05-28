# Changelog

All notable changes to this project will be documented in this file. The format
is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
