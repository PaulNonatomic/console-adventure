/**
 * Default theme — phosphor lime + amber + magenta + cyan on a
 * dark backdrop. Same palette as console-shell ships, kept
 * independent here so this package has zero peer-dependencies.
 *
 * Override any field via `theme:` in AdventureConfig;
 * `resolveTheme(partial)` shallow-merges over this default.
 */
import type { Theme } from './types.js';

export const DEFAULT_THEME: Theme = {
	primary: '#C7F441',
	accent: '#F5A623',
	danger: '#FF388F',
	info: '#00D4FF',
	text: '#eef0f5',
	dim: '#909090',
	fontFamily: 'ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace',
	fontSize: '12px'
};

export function resolveTheme(theme?: Partial<Theme>): Theme {
	return { ...DEFAULT_THEME, ...(theme ?? {}) };
}
