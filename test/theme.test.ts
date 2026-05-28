/**
 * Theme is re-exported from `console-shell` — these tests
 * exercise it through the `console-adventure` entry point to
 * confirm the re-export round-trips correctly (a consumer who
 * only installs console-adventure should get a working
 * `DEFAULT_THEME` and `resolveTheme` without having to add
 * console-shell to their imports).
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_THEME, resolveTheme } from '../src/index.js';

describe('theme (re-exported from console-shell)', () => {
	it('returns the default theme when called with nothing', () => {
		expect(resolveTheme()).toEqual(DEFAULT_THEME);
	});

	it('merges a partial override over the defaults', () => {
		const merged = resolveTheme({ primary: '#ff0000' });
		expect(merged.primary).toBe('#ff0000');
		expect(merged.danger).toBe(DEFAULT_THEME.danger);
	});

	it('does not mutate the default theme', () => {
		const before = { ...DEFAULT_THEME };
		resolveTheme({ primary: '#abc' });
		expect(DEFAULT_THEME).toEqual(before);
	});

	it('exposes every theme slot needed by the adventure renderer', () => {
		// The adventure's style.ts reads these specific slots —
		// guard against console-shell removing any of them.
		expect(DEFAULT_THEME).toHaveProperty('primary');
		expect(DEFAULT_THEME).toHaveProperty('accent');
		expect(DEFAULT_THEME).toHaveProperty('danger');
		expect(DEFAULT_THEME).toHaveProperty('info');
		expect(DEFAULT_THEME).toHaveProperty('text');
		expect(DEFAULT_THEME).toHaveProperty('dim');
		expect(DEFAULT_THEME).toHaveProperty('fontFamily');
		expect(DEFAULT_THEME).toHaveProperty('fontSize');
	});
});
