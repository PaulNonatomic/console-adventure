import { describe, it, expect, vi } from 'vitest';
import { createAdventure } from '../src/adventure.js';
import type { AdventureConfig } from '../src/types.js';
import type { Logger, Shell } from 'console-shell';

function makeLogger(): { logger: Logger; messages: string[] } {
	const messages: string[] = [];
	return {
		logger: { log: (m: string) => messages.push(m) },
		messages
	};
}

const branchingScript: AdventureConfig = {
	start: 'entrance',
	scenes: {
		entrance: {
			heading: 'entrance',
			narration: ['stand at the door.'],
			choices: [
				{ label: 'go left', points: 2, next: 'left' },
				{ label: 'go right', points: 1, next: 'right' }
			]
		},
		left: {
			heading: 'left room',
			narration: ['lefty.'],
			choices: [{ label: 'forward', points: 3, next: 'end' }]
		},
		right: {
			heading: 'right room',
			narration: ['righty.'],
			choices: [{ label: 'forward', points: 3, next: 'end' }]
		},
		end: {
			heading: 'the end',
			narration: ['done.'],
			choices: [{ label: 'sign off', points: 3, next: null }]
		}
	},
	tiers: [
		{ minScore: 0, label: 'Newbie' },
		{ minScore: 5, label: 'Solid' },
		{ minScore: 8, label: 'Legend' }
	]
};

describe('createAdventure / scoring', () => {
	it('computes maxScore via DFS — branches do not double-count', () => {
		const a = createAdventure(branchingScript);
		expect(a.maxScore).toBe(8); // entrance(2) + left(3) + end(3)
	});

	it('resolves tiers by highest qualifying minScore', () => {
		const a = createAdventure(branchingScript);
		expect(a.tierFor(0)).toBe('Newbie');
		expect(a.tierFor(4)).toBe('Newbie');
		expect(a.tierFor(5)).toBe('Solid');
		expect(a.tierFor(8)).toBe('Legend');
	});

	it('falls back to "Player" when no tier table is supplied', () => {
		const a = createAdventure({ ...branchingScript, tiers: undefined });
		expect(a.tierFor(0)).toBe('Player');
	});

	it('throws on a missing start scene', () => {
		expect(() =>
			createAdventure({ ...branchingScript, start: 'nowhere' })
		).toThrow(/start scene/);
	});
});

describe('createAdventure / standalone playthrough', () => {
	it('drives a full left-branch playthrough end-to-end', () => {
		const { logger, messages } = makeLogger();
		const onStart = vi.fn();
		const onComplete = vi.fn();
		const a = createAdventure({
			...branchingScript,
			logger,
			onStart,
			onComplete
		});
		a.start();
		expect(onStart).toHaveBeenCalledOnce();
		expect(messages.some((m) => m.includes('entrance'))).toBe(true);

		a.choose(1); // → left
		expect(messages.some((m) => m.includes('left room'))).toBe(true);

		a.choose(1); // → end
		expect(messages.some((m) => m.includes('the end'))).toBe(true);

		a.choose(1); // → null → finish
		expect(onComplete).toHaveBeenCalledWith({
			score: 8,
			max: 8,
			tier: 'Legend'
		});
		expect(a.getState()?.finished).toBe(true);
	});

	it('respects branching — going right uses a different scene', () => {
		const { logger, messages } = makeLogger();
		const a = createAdventure({ ...branchingScript, logger });
		a.start();
		a.choose(2);
		expect(messages.some((m) => m.includes('right room'))).toBe(true);
		expect(messages.some((m) => m.includes('left room'))).toBe(false);
	});

	it('rejects out-of-range choices with a hint', () => {
		const { logger, messages } = makeLogger();
		const a = createAdventure({ ...branchingScript, logger });
		a.start();
		a.choose(99);
		expect(messages.some((m) => m.includes('not available'))).toBe(true);
	});

	it('warns when choose() is called before start()', () => {
		const { logger, messages } = makeLogger();
		const a = createAdventure({ ...branchingScript, logger });
		a.choose(1);
		expect(messages.some((m) => m.includes('No game in progress'))).toBe(true);
	});

	it('warns when choose() is called after finishing', () => {
		const { logger, messages } = makeLogger();
		const a = createAdventure({ ...branchingScript, logger });
		a.start();
		a.choose(1);
		a.choose(1);
		a.choose(1); // finish
		a.choose(1); // post-finish
		expect(messages.some((m) => m.includes('already finished'))).toBe(true);
	});
});

describe('createAdventure / share', () => {
	it('opens the share intent only after the game finishes', () => {
		const { logger } = makeLogger();
		const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
		const onShare = vi.fn();
		const a = createAdventure({
			...branchingScript,
			logger,
			onShare,
			share: {
				text: ({ score, tier }) => `Score ${score} as ${tier}`,
				url: ({ score }) => `https://demo.test/${score}`
			}
		});

		a.share();
		expect(openSpy).not.toHaveBeenCalled();
		expect(onShare).not.toHaveBeenCalled();

		a.start();
		a.choose(1);
		a.choose(1);
		a.choose(1);
		a.share();
		expect(openSpy).toHaveBeenCalledOnce();
		expect(onShare).toHaveBeenCalledWith({ score: 8, max: 8, tier: 'Legend' });

		const intent = openSpy.mock.calls[0]![0] as string;
		expect(intent).toMatch(/^https:\/\/twitter\.com\/intent\/tweet/);
		expect(intent).toContain(encodeURIComponent('Score 8 as Legend'));

		openSpy.mockRestore();
	});

	it('reports "no share configured" when called without ShareConfig', () => {
		const { logger, messages } = makeLogger();
		const a = createAdventure({ ...branchingScript, logger });
		a.start();
		a.choose(1);
		a.choose(1);
		a.choose(1);
		a.share();
		expect(messages.some((m) => m.includes('No share configured'))).toBe(true);
	});
});

describe('createAdventure / asShellPlugin', () => {
	it('registers play / choose / share on a shell-like receiver', () => {
		const registered: Record<
			string,
			{ description: string; color?: string; run: (...args: unknown[]) => void }
		> = {};
		const fakeShell = {
			theme: {
				primary: '#fff',
				accent: '#fff',
				danger: '#fff',
				info: '#fff',
				text: '#fff',
				dim: '#fff',
				fontFamily: 'monospace',
				fontSize: '12px'
			},
			logger: { log: () => {} },
			registerCommand: (name: string, cmd: typeof registered[string]) => {
				registered[name] = cmd;
			}
		};
		const a = createAdventure({
			...branchingScript,
			share: { text: () => 't', url: () => 'u' }
		});
		a.asShellPlugin().attachTo(fakeShell as unknown as Shell);
		expect(registered.play).toBeTypeOf('object');
		expect(registered.choose).toBeTypeOf('object');
		expect(registered.share).toBeTypeOf('object');
	});

	it('omits share when no ShareConfig is supplied', () => {
		const registered: Record<string, unknown> = {};
		const fakeShell = {
			theme: {
				primary: '#fff',
				accent: '#fff',
				danger: '#fff',
				info: '#fff',
				text: '#fff',
				dim: '#fff',
				fontFamily: 'monospace',
				fontSize: '12px'
			},
			logger: { log: () => {} },
			registerCommand: (name: string, cmd: unknown) => {
				registered[name] = cmd;
			}
		};
		const a = createAdventure(branchingScript);
		a.asShellPlugin().attachTo(fakeShell as unknown as Shell);
		expect(registered.play).toBeTypeOf('object');
		expect(registered.choose).toBeTypeOf('object');
		expect(registered.share).toBeUndefined();
	});

	it('routes choose(n) coercion through the shell-registered command', () => {
		const calls: Array<{ name: string; args: unknown[] }> = [];
		const registered: Record<
			string,
			{ run: (...args: unknown[]) => void }
		> = {};
		const fakeShell = {
			theme: {
				primary: '#fff',
				accent: '#fff',
				danger: '#fff',
				info: '#fff',
				text: '#fff',
				dim: '#fff',
				fontFamily: 'monospace',
				fontSize: '12px'
			},
			logger: { log: (m: string) => calls.push({ name: 'log', args: [m] }) },
			registerCommand: (name: string, cmd: { run: (...args: unknown[]) => void }) => {
				registered[name] = cmd;
			}
		};
		const a = createAdventure(branchingScript);
		a.asShellPlugin().attachTo(fakeShell as unknown as Shell);
		registered.play!.run();
		registered.choose!.run('2'); // string coerces to 2 → right
		expect(calls.some((c) => String(c.args[0]).includes('right room'))).toBe(true);
	});

	it('rejects non-numeric choose() arg with a hint', () => {
		const messages: string[] = [];
		const registered: Record<
			string,
			{ run: (...args: unknown[]) => void }
		> = {};
		const fakeShell = {
			theme: {
				primary: '#fff',
				accent: '#fff',
				danger: '#fff',
				info: '#fff',
				text: '#fff',
				dim: '#fff',
				fontFamily: 'monospace',
				fontSize: '12px'
			},
			logger: { log: (m: string) => messages.push(m) },
			registerCommand: (name: string, cmd: { run: (...args: unknown[]) => void }) => {
				registered[name] = cmd;
			}
		};
		const a = createAdventure(branchingScript);
		a.asShellPlugin().attachTo(fakeShell as unknown as Shell);
		registered.choose!.run('abc');
		expect(messages.some((m) => m.includes('needs a number'))).toBe(true);
	});
});
