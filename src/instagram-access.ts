import { fetchWithRetry } from "./instagram-fetch.js";

type InstagramMediaItem = {
	id: string;
	media_type: string;
	media_url?: unknown;
};

type InstagramPostMetadata = InstagramMediaItem & {
	timestamp: string;
	caption?: unknown;
	permalink?: unknown;
};

const MAX_HISTORY_PAGES = 100;
const MEDIA_PER_PAGE = 100;

function isJsonObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasMediaIdentity(value: unknown): value is InstagramMediaItem {
	return (
		isJsonObject(value) &&
		typeof value.id === "string" &&
		/^\d+$/.test(value.id) &&
		typeof value.media_type === "string"
	);
}

function hasPostMetadata(value: unknown): value is InstagramPostMetadata {
	return (
		isJsonObject(value) &&
		typeof value.timestamp === "string" &&
		Number.isFinite(Date.parse(value.timestamp)) &&
		hasMediaIdentity(value)
	);
}

export function instagramReader(
	accountId: string,
	token: string,
	fetcher: typeof fetch = fetch,
) {
	if (!/^\d+$/.test(accountId) || !token.trim())
		throw new Error(
			"Set a numeric INSTAGRAM_ACCOUNT_ID and a nonempty INSTAGRAM_ACCESS_TOKEN.",
		);
	async function readPages(path: string, fields: string): Promise<unknown[]> {
		const items: unknown[] = [];
		const seen = new Set<string>();
		let after: string | undefined;
		for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
			const url = new URL(`https://graph.facebook.com/v26.0/${path}`);
			url.searchParams.set("fields", fields);
			url.searchParams.set("limit", String(MEDIA_PER_PAGE));
			if (after) url.searchParams.set("after", after);
			let response: Response;
			try {
				response = await fetchWithRetry(fetcher, url, {
					headers: { Authorization: `Bearer ${token}` },
				});
			} catch {
				throw new Error(
					"Instagram request failed or timed out; check connectivity and retry.",
				);
			}
			if (!response.ok)
				throw new Error(
					`Instagram request failed (HTTP ${response.status}); check token and account permissions.`,
				);
			let body: unknown;
			try {
				body = await response.json();
			} catch {
				throw new Error("Instagram returned invalid JSON.");
			}
			if (!isJsonObject(body) || !Array.isArray(body.data))
				throw new Error("Instagram returned an invalid media page.");
			items.push(...body.data);
			const paging = body.paging;
			if (!isJsonObject(paging) || !paging.next) return items;
			const cursor = isJsonObject(paging.cursors)
				? paging.cursors.after
				: undefined;
			if (typeof cursor !== "string" || !cursor || seen.has(cursor))
				throw new Error(
					"Instagram returned an invalid or repeated pagination cursor.",
				);
			seen.add(cursor);
			after = cursor;
		}
		throw new Error(
			`Stopped after ${MAX_HISTORY_PAGES} pages; history coverage is incomplete.`,
		);
	}
	async function getMedia() {
		const media = await readPages(
			`${accountId}/media`,
			"id,caption,timestamp,media_type,media_url,permalink",
		);
		if (!media.every(hasPostMetadata))
			throw new Error("Instagram returned invalid media metadata.");
		return media;
	}
	async function getChildren(id: string) {
		if (!/^\d+$/.test(id)) throw new Error("Invalid Instagram media ID.");
		const children = await readPages(
			`${id}/children`,
			"id,media_type,media_url",
		);
		if (!children.every(hasMediaIdentity))
			throw new Error("Instagram returned invalid carousel metadata.");
		return children;
	}
	return { getMedia, getChildren };
}

export async function inspectInstagram(
	accountId: string,
	token: string,
	fetcher: typeof fetch = fetch,
) {
	const reader = instagramReader(accountId, token, fetcher);
	const media = await reader.getMedia();
	const sorted = [...media].sort(
		(a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
	);
	const carousel = sorted.find((item) => item.media_type === "CAROUSEL_ALBUM");
	const children = carousel ? await reader.getChildren(carousel.id) : [];
	return {
		count: media.length,
		types: Object.fromEntries(
			[...new Set(media.map((item) => item.media_type))].map((type) => [
				type,
				media.filter((item) => item.media_type === type).length,
			]),
		),
		newest: sorted[0],
		oldest: sorted.at(-1),
		carousel: carousel ? { ...carousel, children } : undefined,
	};
}
