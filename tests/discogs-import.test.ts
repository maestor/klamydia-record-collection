import { createClient } from "@libsql/client";
import { expect, it } from "vitest";
import { migrate } from "../src/db.js";
import { importDiscogs } from "../src/discogs-import.js";

const folderIds = [2038060, 2381651, 5186965, 2381653];

it("refreshes owned copies and pressing metadata while preserving editorial links and the last complete collection", async () => {
	const db = createClient({ url: "file::memory:" });
	let copies = [10, 11];
	let activeFolder = folderIds[0];
	let title = "Levy";
	let broken = false;
	let detailRequests = 0;
	const request = async (url: string) => {
		const path = new URL(url).pathname;
		if (path.endsWith("/folders"))
			return Response.json({
				folders: folderIds.map((id) => ({
					id,
					name: `Folder ${id}`,
					count: id === activeFolder ? copies.length : 0,
				})),
			});
		if (path.endsWith("/fields"))
			return Response.json({ fields: [{ id: 1, name: "Condition" }] });
		if (path === "/releases/7") {
			detailRequests++;
			return Response.json({
				id: 7,
				title,
				tracklist: [{ title: "Song" }],
			});
		}
		const folder = Number(path.split("/").at(-2));
		const page = Number(new URL(url).searchParams.get("page"));
		const instances = folder === activeFolder ? copies : [];
		return Response.json({
			pagination: {
				page,
				pages: instances.length || 1,
				items: instances.length,
			},
			releases: broken
				? []
				: instances.slice(page - 1, page).map((instance_id) => ({
						instance_id,
						id: 7,
						folder_id: folder,
						notes: [{ field_id: 1, value: "Mint" }],
					})),
		});
	};
	try {
		await migrate(db);
		await db.execute(
			"INSERT INTO posts VALUES ('record','Record','2026-01-01','Caption')",
		);
		await db.execute(
			"INSERT INTO post_discogs_releases(post_slug,release_id,name) VALUES ('record',7,'My pressing')",
		);
		const run = () => importDiscogs(db, "test", request, async () => {});
		expect(await run()).toEqual({ folders: 4, copies: 2, releases: 1 });
		expect(detailRequests).toBe(1);
		const conditions = await db.execute(`
            SELECT f.name AS field, json_extract(note.value,'$.value') AS value
            FROM discogs_copies c, json_each(c.data,'$.notes') note
            JOIN discogs_fields f ON f.field_id=json_extract(note.value,'$.field_id')
            WHERE c.instance_id=10
        `);
		expect(conditions.rows).toEqual([{ field: "Condition", value: "Mint" }]);
		const rows = async () =>
			(
				await db.execute(
					"SELECT instance_id, title, json_extract(r.data,'$.tracklist[0].title') AS song, name FROM discogs_copies JOIN discogs_releases r USING(release_id) JOIN post_discogs_releases USING(release_id) ORDER BY instance_id",
				)
			).rows;
		expect(await rows()).toEqual(
			[10, 11].map((instance_id) => ({
				instance_id,
				title: "Levy",
				song: "Song",
				name: "My pressing",
			})),
		);
		copies = [11];
		activeFolder = folderIds[2];
		title = "Revised pressing title";
		broken = true;
		await expect(run()).rejects.toThrow();
		expect(await rows()).toHaveLength(2);
		broken = false;
		await db.execute(
			"CREATE TRIGGER fail_discogs_write BEFORE INSERT ON discogs_copies BEGIN SELECT RAISE(ABORT, 'test write failure'); END",
		);
		await expect(run()).rejects.toThrow("test write failure");
		expect(await rows()).toHaveLength(2);
		await db.execute("DROP TRIGGER fail_discogs_write");
		expect(await run()).toMatchObject({ copies: 1 });
		expect(await rows()).toMatchObject([
			{ instance_id: 11, title: "Revised pressing title", name: "My pressing" },
		]);
		expect(
			(await db.execute("SELECT folder_id FROM discogs_copies")).rows,
		).toEqual([{ folder_id: folderIds[2] }]);
		copies = [];
		expect(await run()).toMatchObject({ copies: 0, releases: 0 });
		expect(
			(await db.execute("SELECT name FROM post_discogs_releases")).rows,
		).toEqual([{ name: "My pressing" }]);
	} finally {
		db.close();
	}
});

const listing = "/users/maestor/collection/folders";
const firstPage = `${listing}/2038060/releases`;
function sampleResponses(): Record<string, unknown> {
	const responses: Record<string, unknown> = {
		[listing]: {
			folders: folderIds.map((id, i) => ({
				id,
				name: "Klamydia",
				count: i === 0 ? 1 : 0,
			})),
		},
		"/users/maestor/collection/fields": { fields: [] },
		"/releases/7": { id: 7, title: "Levy" },
	};
	for (const id of folderIds) {
		const releases =
			id === folderIds[0] ? [{ instance_id: 11, folder_id: id, id: 7 }] : [];
		responses[`${listing}/${id}/releases`] = {
			pagination: { page: 1, pages: 1, items: releases.length },
			releases,
		};
	}
	return responses;
}

it("uses the personal token only at the API origin and respects rate limits and temporary outages", async () => {
	const db = createClient({ url: "file::memory:" });
	const responses = sampleResponses();
	const waits: number[] = [];
	const statuses = [503, 429, 429];
	try {
		await migrate(db);
		const result = await importDiscogs(
			db,
			"example",
			async (url, options) => {
				expect(new URL(url).origin).toBe("https://api.discogs.com");
				expect(url).not.toContain("example");
				expect(new Headers(options.headers).get("Authorization")).toBe(
					"Discogs token=example",
				);
				expect(options.redirect).toBe("error");
				const status = statuses.shift();
				if (status)
					return new Response(null, {
						status,
						headers: statuses.length === 0 ? { "Retry-After": "3" } : {},
					});
				const path = new URL(url).pathname;
				return Response.json(responses[path], {
					headers:
						path === listing ? { "X-Discogs-Ratelimit-Remaining": "0" } : {},
				});
			},
			async (ms) => {
				waits.push(ms);
			},
		);
		expect(result.copies).toBe(1);
		expect(waits).toEqual([2000, 60000, 3000, 60000]);
	} finally {
		db.close();
	}
});

it.each([
	[listing, null, "object"],
	[listing, { folders: {} }, "list"],
	[listing, { folders: [] }, "is missing"],
	[
		listing,
		{ folders: [{ id: 2038060, name: "Klamydia", count: -1 }] },
		"integer",
	],
	[
		firstPage,
		{ pagination: { page: 1, pages: 1, items: 3 }, releases: [] },
		"pagination changed",
	],
	[
		firstPage,
		{
			pagination: { page: 1, pages: 1, items: 1 },
			releases: [{ instance_id: 11, id: 7, folder_id: 99 }],
		},
		"Unexpected Discogs folder",
	],
	[
		"/releases/7",
		{ id: 8, title: "Another pressing" },
		"Wrong Discogs release",
	],
	["/releases/7", { id: 7, title: "" }, "name or title"],
] as const)(
	"rejects an inconsistent response at %s (%s)",
	async (path, payload, message) => {
		const db = createClient({ url: "file::memory:" });
		try {
			await migrate(db);
			await db.execute(
				"INSERT INTO discogs_releases VALUES(9,'Previous snapshot','{}')",
			);
			const responses = sampleResponses();
			responses[path] = payload;
			await expect(
				importDiscogs(db, "example", async (url) =>
					Response.json(responses[new URL(url).pathname]),
				),
			).rejects.toThrow(message);
			expect(
				(await db.execute("SELECT title FROM discogs_releases")).rows,
			).toEqual([{ title: "Previous snapshot" }]);
		} finally {
			db.close();
		}
	},
);
it("reports missing and rejected credentials and stops after repeated throttling", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		await expect(importDiscogs(db, " ")).rejects.toThrow(
			"DISCOGS_ACCESS_TOKEN",
		);
		for (const [status, expectedAttempts] of [
			[401, 1],
			[429, 4],
		]) {
			let attempts = 0;
			await expect(
				importDiscogs(
					db,
					"test",
					async () => {
						attempts++;
						return new Response("Failure", { status });
					},
					async () => {},
				),
			).rejects.toThrow(`HTTP ${status}`);
			expect(attempts).toBe(expectedAttempts);
		}
	} finally {
		db.close();
	}
});
