/**
 * Adventure-specific style-string builders.
 *
 * Shared helpers (`styleFor`, `styleBoldFor`) and the
 * `Theme` / `ThemeColor` types live in console-shell — we
 * import them here. What stays in this file is the styles
 * that are *adventure-specific*: scene heading, narration,
 * choices, result callout, finish banner.
 */
import type { Theme } from 'console-shell';

function baseFont(theme: Theme): string {
	return `font-family: ${theme.fontFamily}; font-size: ${theme.fontSize};`;
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
