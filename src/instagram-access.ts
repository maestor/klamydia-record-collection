import { fetchWithRetry } from "./instagram-fetch.js";

export type Media = {
	id: string;
	timestamp: string;
	media_type: string;
	caption?: string;
	permalink?: string;
	media_url?: string;
};
export type Child = { id: string; media_type: string; media_url?: string };

export function instagramReader(
	accountId: string,
	token: string,
	fetcher: typeof fetch = fetch,
) {
	if (!/^\d+$/.test(accountId) || !token.trim())
		throw new Error(
			"Set a numeric INSTAGRAM_ACCOUNT_ID and a nonempty INSTAGRAM_ACCESS_TOKEN.",
		);
	async function pages<T>(path: string, fields: string): Promise<T[]> {
		const items: T[] = [];
		const seen = new Set<string>();
		let after: string | undefined;
		for (let page = 0; page < 100; page++) {
			const url = new URL(`https://graph.facebook.com/v26.0/${path}`);
			url.searchParams.set("fields", fields);
			url.searchParams.set("limit", "100");
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
			let body: {
				data?: unknown;
				paging?: { next?: unknown; cursors?: { after?: unknown } };
			};
			try {
				body = (await response.json()) as typeof body;
			} catch {
				throw new Error("Instagram returned invalid JSON.");
			}
			if (!Array.isArray(body.data))
				throw new Error("Instagram returned an invalid media page.");
			items.push(...(body.data as T[]));
			if (!body.paging?.next) return items;
			const cursor = body.paging.cursors?.after;
			if (typeof cursor !== "string" || !cursor || seen.has(cursor))
				throw new Error(
					"Instagram returned an invalid or repeated pagination cursor.",
				);
			seen.add(cursor);
			after = cursor;
		}
		throw new Error("Stopped after 100 pages; history coverage is incomplete.");
	}
	async function getMedia() {
		const media = await pages<Media>(
			`${accountId}/media`,
			"id,caption,timestamp,media_type,media_url,permalink",
		);
		if (
			media.some(
				(item) =>
					!item ||
					!/^\d+$/.test(item.id) ||
					typeof item.timestamp !== "string" ||
					!Number.isFinite(Date.parse(item.timestamp)) ||
					typeof item.media_type !== "string",
			)
		)
			throw new Error("Instagram returned invalid media metadata.");
		return media;
	}
	async function getChildren(id: string) {
		if (!/^\d+$/.test(id)) throw new Error("Invalid Instagram media ID.");
		const children = await pages<Child>(
			`${id}/children`,
			"id,media_type,media_url",
		);
		if (
			children.some(
				(item) =>
					!item ||
					!/^\d+$/.test(item.id) ||
					typeof item.media_type !== "string",
			)
		)
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
