import { describe, it, expect } from 'vitest';
import {
	buildXIntent,
	buildMastodonIntent,
	buildBlueskyIntent
} from '../src/share.js';

describe('share intent builders', () => {
	it('builds a Twitter/X intent with encoded text + url', () => {
		const intent = buildXIntent('hello world', 'https://demo.test/?s=8');
		expect(intent).toMatch(/^https:\/\/twitter\.com\/intent\/tweet/);
		expect(intent).toContain('text=hello%20world');
		expect(intent).toContain('url=https%3A%2F%2Fdemo.test%2F%3Fs%3D8');
	});

	it('builds a Mastodon share URL with default instance', () => {
		const intent = buildMastodonIntent('hi', 'https://demo.test');
		expect(intent).toMatch(/^https:\/\/mastodon\.social\/share/);
		expect(intent).toContain('hi');
		expect(intent).toContain('demo.test');
	});

	it('respects a custom Mastodon instance', () => {
		const intent = buildMastodonIntent('hi', 'https://demo.test', 'mas.to');
		expect(intent).toMatch(/^https:\/\/mas\.to\/share/);
	});

	it('builds a Bluesky compose intent', () => {
		const intent = buildBlueskyIntent('post body', 'https://demo.test');
		expect(intent).toMatch(/^https:\/\/bsky\.app\/intent\/compose/);
		expect(intent).toContain('post%20body');
	});
});
