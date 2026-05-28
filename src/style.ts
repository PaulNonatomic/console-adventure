/**
 * Style-string builders for the adventure renderer. Returns
 * the CSS strings passed as the second argument to
 * `logger.log("%c...", style)`.
 *
 * Kept independent from console-shell so the engine can be
 * used without that package — when bridged onto a shell, the
 * bridge just passes the shell's theme through to these
 * builders and the output looks consistent across the two.
 */
import type { Theme, ThemeColor } from './types.js';

function baseFont(theme: Theme): string {
	return `font-family: ${theme.fontFamily}; font-size: ${theme.fontSize};`;
}

export function styleFor(theme: Theme, slot: ThemeColor): string {
	return `color: ${theme[slot]}; ${baseFont(theme)}`;
}

export function styleBoldFor(theme: Theme, slot: ThemeColor): string {
	return `color: ${theme[slot]}; font-weight: bold; ${baseFont(theme)}`;
}

/** Scene heading — primary, bold, one rank larger than body. */
export function styleSceneHeading(theme: Theme): string {
	return `color: ${theme.primary}; font-weight: bold; font-family: ${theme.fontFamily}; font-size: 13px;`;
}

/** Scene narration — body text, looser line-height. */
export function styleNarration(theme: Theme): string {
	return `color: ${theme.text}; line-height: 1.5; ${baseFont(theme)}`;
}

/** Numbered choice lines — accent. */
export function styleChoice(theme: Theme): string {
	return `color: ${theme.accent}; ${baseFont(theme)}`;
}

/**
 * Result callout pieces — bumped to 13px bold so the
 * consequence of each choice reads as a beat, not as more
 * prompt-chrome.
 */
export function styleResultMarker(theme: Theme): string {
	return `color: ${theme.accent}; font-weight: bold; font-family: ${theme.fontFamily}; font-size: 13px;`;
}
export function styleResultText(theme: Theme): string {
	return `color: ${theme.text}; font-weight: bold; line-height: 1.5; font-family: ${theme.fontFamily}; font-size: 13px;`;
}
export function styleResultRule(theme: Theme): string {
	return `color: ${theme.accent}; ${baseFont(theme)}`;
}

/** Finish heading — danger, larger and bold. */
export function styleFinish(theme: Theme): string {
	return `color: ${theme.danger}; font-weight: bold; font-family: ${theme.fontFamily}; font-size: 14px;`;
}
