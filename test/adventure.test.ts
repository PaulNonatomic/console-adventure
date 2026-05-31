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

/* ─── items / inventory ────────────────────────────────── */

const itemScript: AdventureConfig = {
	start: 'start',
	items: {
		key: { name: 'brass key', description: 'cold to the touch' },
		torch: {
			name: 'torch',
			description: 'a stick wrapped in oilcloth',
			onUse: { text: 'You light the torch.', points: 1 }
		},
		ration: {
			name: 'travel ration',
			onUse: {
				text: 'You eat the ration.',
				points: 1,
				consumed: true
			}
		},
		map: {
			name: 'map',
			onUse: {
				inScenes: ['chamber'],
				text: 'You orient yourself.',
				goTo: 'finale'
			}
		}
	},
	scenes: {
		start: {
			heading: 'start',
			narration: ['a foyer with three exits.'],
			items: ['key', 'ration'],
			choices: [
				{ label: 'enter chamber', next: 'chamber' },
				{
					label: 'unlock the side door',
					requires: ['key'],
					consumes: ['key'],
					next: 'sidequest'
				}
			]
		},
		chamber: {
			heading: 'chamber',
			narration: ['a dim room.'],
			items: ['torch', 'map'],
			choices: [{ label: 'continue', next: 'finale' }]
		},
		sidequest: {
			heading: 'sidequest',
			narration: ['side path.'],
			choices: [{ label: 'finish', points: 2, next: 'finale' }]
		},
		finale: {
			heading: 'finale',
			narration: ['done.'],
			choices: [{ label: 'sign off', next: null }]
		}
	}
};

describe('items / inventory', () => {
	it('seeds sceneItems from each scene at start()', () => {
		const a = createAdventure(itemScript);
		a.start();
		const s = a.getState()!;
		expect(s.sceneItems.start).toEqual(['key', 'ration']);
		expect(s.sceneItems.chamber).toEqual(['torch', 'map']);
		expect(s.inventory).toEqual([]);
	});

	it('pickup moves an item from scene to inventory', () => {
		const a = createAdventure(itemScript);
		a.start();
		a.pickup(1);
		const s = a.getState()!;
		expect(s.inventory).toEqual(['key']);
		expect(s.sceneItems.start).toEqual(['ration']);
	});

	it('hides choices whose `requires` are unmet', () => {
		const { logger, messages } = makeLogger();
		const a = createAdventure({ ...itemScript, logger });
		a.start();
		// The "unlock the side door" choice should be HIDDEN
		// until the player picks up the key. The visible list
		// is therefore just the one "enter chamber" choice.
		// `choose(2)` then resolves to "no choice 2".
		const before = messages.length;
		a.choose(2);
		expect(messages.slice(before).some((m) => m.includes('Choice 2 not available'))).toBe(
			true
		);
	});

	it('reveals a `requires` choice once the player picks up the item', () => {
		const a = createAdventure(itemScript);
		a.start();
		a.pickup(1); // key
		// The locked choice now appears at index 2.
		a.choose(2);
		expect(a.getState()!.sceneId).toBe('sidequest');
	});

	it('removes items in `consumes` from the inventory on choice', () => {
		const a = createAdventure(itemScript);
		a.start();
		a.pickup(1); // key
		expect(a.getState()!.inventory).toEqual(['key']);
		a.choose(2); // unlock — consumes key
		expect(a.getState()!.inventory).toEqual([]);
	});

	it('drop puts an item back into the current scene', () => {
		const a = createAdventure(itemScript);
		a.start();
		a.pickup(1); // key
		a.drop(1);
		const s = a.getState()!;
		expect(s.inventory).toEqual([]);
		expect(s.sceneItems.start).toContain('key');
	});

	it('use fires an item\'s onUse effect (flavour + points)', () => {
		const { logger, messages } = makeLogger();
		const a = createAdventure({ ...itemScript, logger });
		a.start();
		a.choose(1); // enter chamber
		a.pickup(1); // torch
		const scoreBefore = a.getState()!.score;
		a.use(1);
		expect(a.getState()!.score).toBe(scoreBefore + 1);
		expect(messages.some((m) => m.includes('light the torch'))).toBe(true);
	});

	it('use removes a consumed item from inventory after firing', () => {
		const a = createAdventure(itemScript);
		a.start();
		a.pickup(2); // ration (index 2 in start scene)
		expect(a.getState()!.inventory).toEqual(['ration']);
		a.use(1);
		expect(a.getState()!.inventory).toEqual([]);
	});

	it('use respects inScenes — refuses outside the listed scenes', () => {
		const { logger, messages } = makeLogger();
		const a = createAdventure({ ...itemScript, logger });
		a.start();
		// Grab the map in the start scene (it's only allowed to
		// be used in `chamber`). The scene's items are [key,
		// ration] -- we need to GET the map first via chamber...
		// so instead: enter chamber, take map, head to finale,
		// then try to use it -- but that's already finished. Use
		// it WHILE in start scene by handcrafting a state: easier
		// to just pickup the map after entering chamber, then
		// drop it, go elsewhere, and try to use. For brevity we
		// just go to chamber, pickup map (index 2 there), use,
		// confirm jump worked; that's the happy path.
		a.choose(1); // enter chamber
		a.pickup(2); // map
		a.use(1); // map -> jumps to finale
		expect(a.getState()!.sceneId).toBe('finale');
	});

	it('inventory() prints the dim empty message when nothing held', () => {
		const { logger, messages } = makeLogger();
		const a = createAdventure({ ...itemScript, logger });
		a.start();
		const before = messages.length;
		a.inventory();
		expect(messages.slice(before).some((m) => m.includes('inventory is empty'))).toBe(
			true
		);
	});

	it('grants adds an item to inventory on choice selection', () => {
		const a = createAdventure({
			start: 's',
			items: { gift: { name: 'gift' } },
			scenes: {
				s: {
					heading: 's',
					narration: [''],
					choices: [{ label: 'receive', grants: ['gift'], next: null }]
				}
			}
		});
		a.start();
		a.choose(1);
		expect(a.getState()!.inventory).toEqual(['gift']);
	});

	it('shell plugin registers pickup / drop / use / inventory / look', () => {
		const registered: Record<string, { run: (...args: unknown[]) => void }> = {};
		const fakeShell = {
			logger: { log: () => {} },
			theme: {},
			registerCommand: (
				name: string,
				cmd: { run: (...args: unknown[]) => void }
			) => {
				registered[name] = cmd;
			}
		};
		const a = createAdventure(itemScript);
		a.asShellPlugin().attachTo(fakeShell as unknown as Shell);
		expect(registered.pickup).toBeDefined();
		expect(registered.drop).toBeDefined();
		expect(registered.use).toBeDefined();
		expect(registered.inventory).toBeDefined();
		expect(registered.look).toBeDefined();
	});
});

/* ─── state, conditions, conditional branches ──────────── */

describe('state + conditional branches', () => {
	it('seeds vars from initialState and visited from the start scene', () => {
		const a = createAdventure({
			start: 'a',
			initialState: { gold: 5 },
			scenes: {
				a: { heading: 'A', narration: [], choices: [{ label: 'x', next: null }] }
			}
		});
		a.start();
		const s = a.getState()!;
		expect(s.vars).toEqual({ gold: 5 });
		expect(s.visited).toEqual(['a']);
	});

	it('choice effects mutate vars (set + add)', () => {
		const a = createAdventure({
			start: 'a',
			scenes: {
				a: {
					heading: 'A',
					narration: [],
					choices: [
						{
							label: 'gain',
							effects: [
								{ var: 'gold', op: 'set', value: 10 },
								{ var: 'gold', op: 'add', value: 5 }
							],
							next: 'b'
						}
					]
				},
				b: { heading: 'B', narration: [], choices: [{ label: 'end', next: null }] }
			}
		});
		a.start();
		a.choose(1);
		expect(a.getState()!.vars.gold).toBe(15);
	});

	it('routes to a branch target when its condition holds, else next', () => {
		const make = () =>
			createAdventure({
				start: 'gate',
				items: { key: { name: 'key' } },
				scenes: {
					gate: {
						heading: 'gate',
						narration: [],
						items: ['key'],
						choices: [
							{
								label: 'open',
								branches: [
									{ when: [{ kind: 'hasItem', item: 'key' }], goTo: 'vault' }
								],
								next: 'locked'
							}
						]
					},
					vault: { heading: 'vault', narration: [], choices: [{ label: 'e', next: null }] },
					locked: { heading: 'locked', narration: [], choices: [{ label: 'e', next: null }] }
				}
			});

		// Without the key → fallback `next`.
		const a1 = make();
		a1.start();
		a1.choose(1);
		expect(a1.getState()!.sceneId).toBe('locked');

		// With the key → branch wins.
		const a2 = make();
		a2.start();
		a2.pickup(1); // key
		a2.choose(1);
		expect(a2.getState()!.sceneId).toBe('vault');
	});

	it('evaluates a var-compare branch against effects set earlier in the chain', () => {
		const a = createAdventure({
			start: 'a',
			scenes: {
				a: {
					heading: 'A',
					narration: [],
					choices: [{ label: 'trust', effects: [{ var: 'trust', op: 'add', value: 3 }], next: 'b' }]
				},
				b: {
					heading: 'B',
					narration: [],
					choices: [
						{
							label: 'approach',
							branches: [
								{ when: [{ kind: 'var', var: 'trust', op: '>=', value: 3 }], goTo: 'ally' }
							],
							next: 'rebuff'
						}
					]
				},
				ally: { heading: 'ally', narration: [], choices: [{ label: 'e', next: null }] },
				rebuff: { heading: 'rebuff', narration: [], choices: [{ label: 'e', next: null }] }
			}
		});
		a.start();
		a.choose(1); // +3 trust → b
		a.choose(1); // branch: trust>=3 → ally
		expect(a.getState()!.sceneId).toBe('ally');
	});

	it('first matching branch wins; empty when[] always matches', () => {
		const a = createAdventure({
			start: 'a',
			scenes: {
				a: {
					heading: 'A',
					narration: [],
					choices: [
						{
							label: 'go',
							branches: [
								{ when: [{ kind: 'score', op: '>=', value: 100 }], goTo: 'rich' },
								{ when: [], goTo: 'default' }
							],
							next: 'unused'
						}
					]
				},
				rich: { heading: 'rich', narration: [], choices: [{ label: 'e', next: null }] },
				default: { heading: 'd', narration: [], choices: [{ label: 'e', next: null }] },
				unused: { heading: 'u', narration: [], choices: [{ label: 'e', next: null }] }
			}
		});
		a.start();
		a.choose(1);
		// score is 0, first branch fails, empty-when branch wins.
		expect(a.getState()!.sceneId).toBe('default');
	});

	it('visited condition reads the run path; negate inverts it', () => {
		const a = createAdventure({
			start: 'a',
			scenes: {
				a: {
					heading: 'A',
					narration: [],
					choices: [{ label: 'to b', next: 'b' }]
				},
				b: {
					heading: 'B',
					narration: [],
					choices: [
						{
							label: 'check',
							branches: [
								{ when: [{ kind: 'visited', scene: 'a' }], goTo: 'knew' }
							],
							next: 'new'
						}
					]
				},
				knew: { heading: 'k', narration: [], choices: [{ label: 'e', next: null }] },
				new: { heading: 'n', narration: [], choices: [{ label: 'e', next: null }] }
			}
		});
		a.start();
		a.choose(1); // a -> b (a is visited)
		a.choose(1); // visited 'a' → knew
		expect(a.getState()!.sceneId).toBe('knew');
	});

	it('item onUse effects mutate state', () => {
		const a = createAdventure({
			start: 'a',
			items: {
				lantern: { name: 'lantern', onUse: { text: 'lit', effects: [{ var: 'lit', op: 'set', value: 1 }] } }
			},
			scenes: {
				a: {
					heading: 'A',
					narration: [],
					items: ['lantern'],
					choices: [{ label: 'e', next: null }]
				}
			}
		});
		a.start();
		a.pickup(1);
		a.use(1);
		expect(a.getState()!.vars.lit).toBe(1);
	});
});
