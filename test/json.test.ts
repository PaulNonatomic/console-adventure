import { describe, it, expect, vi } from 'vitest';
import { createAdventureFromJson } from '../src/json.js';
import type { AdventureJson } from '../src/json.js';
import type { Logger } from 'console-shell';

function makeLogger(): { logger: Logger; messages: string[] } {
	const messages: string[] = [];
	return {
		logger: { log: (m: string) => messages.push(m) },
		messages
	};
}

const minimalJson: AdventureJson = {
	start: 'start',
	scenes: {
		start: {
			heading: 'start',
			narration: ['hi'],
			choices: [
				{ label: 'go', points: 5, next: 'end' }
			]
		},
		end: {
			heading: 'end',
			narration: ['done'],
			choices: [{ label: 'finish', points: 3, next: null }]
		}
	},
	tiers: [
		{ minScore: 0, label: 'Newbie' },
		{ minScore: 7, label: 'Pro' }
	]
};

describe('createAdventureFromJson / validation', () => {
	it('throws when the top-level value is not an object', () => {
		expect(() =>
			createAdventureFromJson('not an object' as unknown as AdventureJson)
		).toThrow(/must be an object/);
	});

	it('throws when `start` is missing', () => {
		expect(() =>
			createAdventureFromJson({ scenes: {} } as unknown as AdventureJson)
		).toThrow(/"start"/);
	});

	it('throws when `scenes` is missing', () => {
		expect(() =>
			createAdventureFromJson({ start: 'x' } as unknown as AdventureJson)
		).toThrow(/"scenes"/);
	});

	it('throws when the start scene id is not in scenes', () => {
		expect(() =>
			createAdventureFromJson({
				start: 'nowhere',
				scenes: { somewhere: minimalJson.scenes.somewhere! ?? minimalJson.scenes.start }
			} as unknown as AdventureJson)
		).toThrow(/start scene/);
	});

	it('throws when share is present but text/url are not strings', () => {
		expect(() =>
			createAdventureFromJson({
				...minimalJson,
				share: { text: 42, url: 'ok' } as unknown as AdventureJson['share']
			})
		).toThrow(/share\.text and share\.url/);
	});
});

describe('createAdventureFromJson / scenes + scoring', () => {
	it('round-trips a minimal config through the engine', () => {
		const { logger, messages } = makeLogger();
		const onComplete = vi.fn();
		const a = createAdventureFromJson(minimalJson, {
			logger,
			onComplete
		});
		expect(a.maxScore).toBe(8); // 5 + 3
		a.start();
		expect(messages.some((m) => m.includes('start'))).toBe(true);
		a.choose(1);
		a.choose(1);
		expect(onComplete).toHaveBeenCalledWith({
			score: 8,
			max: 8,
			tier: 'Pro'
		});
	});
});

describe('createAdventureFromJson / share templates', () => {
	it('compiles share.text and share.url templates', () => {
		const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
		const { logger } = makeLogger();
		const a = createAdventureFromJson(
			{
				...minimalJson,
				share: {
					text: 'Forged ${tier} (${score}/${max}) at example.com',
					url: 'https://example.com/foundry?s=${score}&t=${tier}'
				}
			},
			{ logger }
		);
		a.start();
		a.choose(1);
		a.choose(1);
		a.share();

		const intent = openSpy.mock.calls[0]![0] as string;
		// Default intent is X
		expect(intent).toMatch(/^https:\/\/twitter\.com\/intent\/tweet/);
		expect(intent).toContain(encodeURIComponent('Forged Pro (8/8) at example.com'));
		expect(intent).toContain(encodeURIComponent('https://example.com/foundry?s=8&t=Pro'));

		openSpy.mockRestore();
	});

	it('substitutes ${score}, ${max}, ${tier} only — unknown placeholders render empty', () => {
		const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
		const { logger } = makeLogger();
		const a = createAdventureFromJson(
			{
				...minimalJson,
				share: {
					text: 'a:${score} b:${unknown} c:${tier}',
					url: 'https://example.com/?s=${score}'
				}
			},
			{ logger }
		);
		a.start();
		a.choose(1);
		a.choose(1);
		a.share();

		const intent = openSpy.mock.calls[0]![0] as string;
		expect(intent).toContain(encodeURIComponent('a:8 b: c:Pro'));
		openSpy.mockRestore();
	});

	it('selects the bluesky intent preset', () => {
		const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
		const { logger } = makeLogger();
		const a = createAdventureFromJson(
			{
				...minimalJson,
				share: {
					text: 'x',
					url: 'https://example.com/${score}',
					intent: 'bluesky'
				}
			},
			{ logger }
		);
		a.start();
		a.choose(1);
		a.choose(1);
		a.share();

		const intent = openSpy.mock.calls[0]![0] as string;
		expect(intent).toMatch(/^https:\/\/bsky\.app\/intent\/compose/);
		openSpy.mockRestore();
	});

	it('selects the mastodon intent preset with default instance', () => {
		const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
		const { logger } = makeLogger();
		const a = createAdventureFromJson(
			{
				...minimalJson,
				share: { text: 'x', url: 'https://e.com/${score}', intent: 'mastodon' }
			},
			{ logger }
		);
		a.start();
		a.choose(1);
		a.choose(1);
		a.share();

		const intent = openSpy.mock.calls[0]![0] as string;
		expect(intent).toMatch(/^https:\/\/mastodon\.social\/share/);
		openSpy.mockRestore();
	});

	it('selects the mastodon intent with a custom instance via `mastodon:host`', () => {
		const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
		const { logger } = makeLogger();
		const a = createAdventureFromJson(
			{
				...minimalJson,
				share: {
					text: 'x',
					url: 'https://e.com/${score}',
					intent: 'mastodon:mas.to'
				}
			},
			{ logger }
		);
		a.start();
		a.choose(1);
		a.choose(1);
		a.share();

		const intent = openSpy.mock.calls[0]![0] as string;
		expect(intent).toMatch(/^https:\/\/mas\.to\/share/);
		openSpy.mockRestore();
	});

	it('throws on an unrecognised intent preset', () => {
		expect(() =>
			createAdventureFromJson({
				...minimalJson,
				share: {
					text: 'x',
					url: 'y',
					intent: 'bogus' as unknown as 'x'
				}
			})
		).toThrow(/Unknown share intent preset/);
	});
});

describe('createAdventureFromJson / extras', () => {
	it('forwards onStart / onComplete / onShare hooks from extras', () => {
		const { logger } = makeLogger();
		const onStart = vi.fn();
		const onComplete = vi.fn();
		const onShare = vi.fn();
		const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

		const a = createAdventureFromJson(
			{
				...minimalJson,
				share: { text: 't', url: 'u' }
			},
			{ logger, onStart, onComplete, onShare }
		);
		a.start();
		expect(onStart).toHaveBeenCalledOnce();
		a.choose(1);
		a.choose(1);
		expect(onComplete).toHaveBeenCalledOnce();
		a.share();
		expect(onShare).toHaveBeenCalledOnce();

		openSpy.mockRestore();
	});

	it('uses theme from extras when provided', () => {
		const { logger } = makeLogger();
		// We can't easily assert on the styled output without
		// re-parsing CSS — but we can confirm the call doesn't
		// throw with a custom theme.
		expect(() =>
			createAdventureFromJson(minimalJson, {
				logger,
				theme: { primary: '#ff0000' }
			}).start()
		).not.toThrow();
	});
});
