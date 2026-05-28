/**
 * Share-intent helpers. The default builder targets X (Twitter)
 * but the engine is share-platform agnostic — consumers can
 * override `intent` in ShareConfig to target Mastodon, Bluesky,
 * LinkedIn, or a custom share endpoint.
 */

/**
 * Build a Twitter/X "post intent" URL. Encodes the body text
 * and the linked URL as the standard intent parameters that
 * twitter.com / x.com both accept.
 */
export function buildXIntent(text: string, url: string): string {
	const t = encodeURIComponent(text);
	const u = encodeURIComponent(url);
	return `https://twitter.com/intent/tweet?text=${t}&url=${u}`;
}

/**
 * Build a Mastodon share URL. Mastodon doesn't have a single
 * canonical intent URL, so this targets mastodon.social by
 * default — pass an instance host to redirect elsewhere.
 */
export function buildMastodonIntent(
	text: string,
	url: string,
	instance = 'mastodon.social'
): string {
	const body = encodeURIComponent(`${text}\n${url}`);
	return `https://${instance}/share?text=${body}`;
}

/**
 * Build a Bluesky compose intent. Newer service so the schema
 * may move; pinned to the current public spec at time of
 * writing.
 */
export function buildBlueskyIntent(text: string, url: string): string {
	const body = encodeURIComponent(`${text} ${url}`);
	return `https://bsky.app/intent/compose?text=${body}`;
}
