import { describe, it, expect } from 'vitest';
import { DEFAULT_THEME, resolveTheme } from '../src/theme.js';

describe('resolveTheme', () => {
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
});
