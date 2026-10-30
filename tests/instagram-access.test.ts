import { expect, it } from "vitest";
import { inspectInstagram } from "../src/instagram-access.js";

it("checks paginated owned media and carousel children without leaking credentials", async () => {
	const requests: URL[] = [];
	const fetcher: typeof fetch = async (input, init) => {
		const url = new URL(String(input));
		requests.push(url);
		expect(new Headers(init?.headers).get("authorization")).toBe(
			"Bearer private-token",
		);
		if (url.pathname.endsWith("/children"))
			return Response.json({
				data: [
					{
						id: "11",
						media_type: "IMAGE",
						media_url: "https://example.test/a",
					},
					{
						id: "12",
						media_type: "IMAGE",
						media_url: "https://example.test/b",
					},
				],
			});
		if (url.searchParams.has("after"))
			return Response.json({
				data: [
					{
						id: "2",
						timestamp: "2020-01-01T00:00:00+0000",
						media_type: "IMAGE",
						caption: "Vanha",
						permalink: "https://www.instagram.com/p/old/",
						media_url: "https://example.test/image",
					},
				],
			});
		return Response.json({
			data: [
				{
					id: "1",
					timestamp: "2024-01-01T00:00:00+0000",
					media_type: "CAROUSEL_ALBUM",
					caption: "Koko kuvaus\nÄäni",
					permalink: "https://www.instagram.com/p/new/",
				},
			],
			paging: {
				next: "https://ignored.example/?access_token=secret",
				cursors: { after: "next" },
			},
		});
	};
	const result = await inspectInstagram("123", "private-token", fetcher);
	expect(result.count).toBe(2);
	expect(result.oldest?.id).toBe("2");
	expect(result.carousel?.children.map((child) => child.id)).toEqual([
		"11",
		"12",
	]);
	expect(
		requests.every(
			(url) =>
				url.hostname === "graph.facebook.com" &&
				!url.search.includes("private-token"),
		),
	).toBe(true);
});

it("reports authorization failure without printing the upstream response or credentials", async () => {
	await expect(
		inspectInstagram("123", "private-token", async () =>
			Response.json({ error: { message: "private-token" } }, { status: 401 }),
		),
	).rejects.toThrow("HTTP 401");
});

it("rejects a repeated pagination cursor instead of claiming complete history", async () => {
	const fetcher: typeof fetch = async () =>
		Response.json({
			data: [],
			paging: { next: "https://example.test/", cursors: { after: "same" } },
		});
	await expect(inspectInstagram("123", "token", fetcher)).rejects.toThrow(
		"repeated pagination cursor",
	);
});

it("stops safely when configuration, network, or upstream data is invalid", async () => {
	await expect(inspectInstagram("not-an-id", "token")).rejects.toThrow(
		"numeric INSTAGRAM_ACCOUNT_ID",
	);
	await expect(
		inspectInstagram("123", "token", async () => {
			throw new Error("private-token");
		}),
	).rejects.toThrow("failed or timed out");
	await expect(
		inspectInstagram("123", "token", async () => new Response("not json")),
	).rejects.toThrow("invalid JSON");
	await expect(
		inspectInstagram("123", "token", async () =>
			Response.json({
				data: [{ id: "1", timestamp: "invalid", media_type: "IMAGE" }],
			}),
		),
	).rejects.toThrow("invalid media metadata");
});

it("reports an empty account without inventing a carousel or oldest post", async () => {
	const result = await inspectInstagram("123", "token", async () =>
		Response.json({ data: [] }),
	);
	expect(result).toEqual({
		count: 0,
		types: {},
		newest: undefined,
		oldest: undefined,
		carousel: undefined,
	});
});

it("retries a rate-limited request after the indicated delay", async () => {
	let attempts = 0;
	const result = await inspectInstagram("123", "token", async () => {
		attempts++;
		return attempts === 1
			? new Response("limited", {
					status: 429,
					headers: { "retry-after": "0" },
				})
			: Response.json({ data: [] });
	});
	expect(result.count).toBe(0);
	expect(attempts).toBe(2);
});
