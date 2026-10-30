import { createClient } from "@libsql/client";
import sharp from "sharp";
import { expect, it } from "vitest";
import { migrate } from "../src/db.js";
import { importInstagram } from "../src/instagram-import.js";
import { createTestApp as createApp } from "./helpers.js";

it("refuses an import without a configured media store before fetching Instagram data", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		let fetched = false;
		await expect(
			importInstagram({
				db,
				accountId: "123",
				token: "token",
				fetcher: async () => {
					fetched = true;
					throw new Error("unexpected request");
				},
			}),
		).rejects.toThrow("media store");
		expect(fetched).toBe(false);
	} finally {
		db.close();
	}
});

it("imports a carousel with full caption and ordered images, then reruns without duplicates or overwriting its title", async () => {
	const db = createClient({ url: "file::memory:" });
	const objects = new Map<string, Buffer>();
	try {
		await migrate(db);
		const jpeg = await sharp({
			create: { width: 4, height: 4, channels: 3, background: "red" },
		})
			.jpeg()
			.toBuffer();
		const jpeg2 = await sharp({
			create: { width: 4, height: 4, channels: 3, background: "blue" },
		})
			.jpeg()
			.toBuffer();
		let caption = "Koko kuvaus\n\nÄänilevy #punk";
		const fetcher: typeof fetch = async (input) => {
			const url = new URL(String(input));
			if (url.hostname === "images.fbcdn.net")
				return new Response(url.pathname === "/one" ? jpeg : jpeg2, {
					headers: { "content-type": "image/jpeg" },
				});
			if (url.pathname.endsWith("/children"))
				return Response.json({
					data: [
						{
							id: "11",
							media_type: "IMAGE",
							media_url: "https://images.fbcdn.net/one",
						},
						{
							id: "12",
							media_type: "IMAGE",
							media_url: "https://images.fbcdn.net/two",
						},
					],
				});
			return Response.json({
				data: [
					{
						id: "1",
						timestamp: "2024-01-01T00:00:00+0000",
						media_type: "CAROUSEL_ALBUM",
						caption,
						permalink: "https://www.instagram.com/p/test/",
					},
				],
			});
		};
		const options = {
			db,
			putImage: async (name: string, bytes: Buffer) => {
				objects.set(name, bytes);
			},
			accountId: "123",
			token: "token",
			fetcher,
		};
		expect(await importInstagram(options)).toMatchObject({
			created: 1,
			updated: 0,
			unchanged: 0,
		});
		const post = (await db.execute("SELECT slug, description FROM posts"))
			.rows[0];
		expect((await db.execute("SELECT title FROM posts")).rows[0].title).toBe(
			"Koko kuvaus",
		);
		expect(post.description).toBe("Koko kuvaus\n\nÄänilevy #punk");
		const html = await (
			await createApp(db).request(`/posts/${post.slug}`)
		).text();
		expect(html).toContain("Äänilevy #punk");
		document.documentElement.innerHTML = html;
		const preview = document.querySelector(".gallery img");
		expect(preview?.getAttribute("src")).not.toBe(
			preview?.parentElement?.getAttribute("href"),
		);
		const images = (
			await db.execute("SELECT url FROM images ORDER BY position")
		).rows;
		expect(images).toHaveLength(2);
		expect(images[0].url).not.toBe(images[1].url);
		expect(
			(
				await db.execute(
					"SELECT media_id FROM instagram_images ORDER BY position",
				)
			).rows.map((row) => row.media_id),
		).toEqual(["11", "12"]);
		expect(
			(await db.execute("SELECT normalized FROM tags")).rows.map(
				(row) => row.normalized,
			),
		).toEqual(["punk"]);
		for (const image of images)
			expect(
				(
					await sharp(
						objects.get(String(image.url).slice("/media/".length)) as Buffer,
					).metadata()
				).format,
			).toBe("jpeg");
		await db.execute("UPDATE posts SET title = 'Owner title'");
		expect(await importInstagram(options)).toMatchObject({
			created: 0,
			updated: 0,
			unchanged: 1,
		});
		expect((await db.execute("SELECT title FROM posts")).rows[0].title).toBe(
			"Owner title",
		);
		expect(
			(await db.execute("SELECT count(*) AS n FROM images")).rows[0].n,
		).toBe(2);
		caption = "Päivitetty teksti";
		expect(await importInstagram(options)).toMatchObject({ updated: 1 });
		expect(
			(await db.execute("SELECT title, description FROM posts")).rows[0],
		).toMatchObject({ title: "Owner title", description: caption });
	} finally {
		db.close();
	}
});

it("does not publish partial changes when a later image fails, and dry runs leave no data or files", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		const jpeg = await sharp({
			create: { width: 4, height: 4, channels: 3, background: "red" },
		})
			.jpeg()
			.toBuffer();
		let fail = false;
		let uploads = 0;
		const fetcher: typeof fetch = async (input) => {
			const url = new URL(String(input));
			if (url.hostname === "images.fbcdn.net")
				return fail && url.pathname === "/two"
					? new Response("unavailable", { status: 403 })
					: new Response(jpeg);
			return Response.json({
				data: ["1", "2"].map((id) => ({
					id,
					timestamp: `2024-01-0${id}T00:00:00+0000`,
					media_type: "IMAGE",
					caption: `Caption ${id}`,
					permalink: `https://www.instagram.com/p/post${id}/`,
					media_url: `https://images.fbcdn.net/${id === "1" ? "one" : "two"}`,
				})),
			});
		};
		const options = {
			db,
			putImage: async () => {
				uploads++;
			},
			accountId: "123",
			token: "token",
			fetcher,
		};
		expect(await importInstagram({ ...options, dryRun: true })).toMatchObject({
			created: 2,
			dryRun: true,
		});
		expect(
			await importInstagram({ ...options, dryRun: true, mediaId: "1" }),
		).toMatchObject({ created: 1, total: 1 });
		await expect(
			importInstagram({ ...options, dryRun: true, mediaId: "99" }),
		).rejects.toThrow("not found");
		expect(
			(await db.execute("SELECT count(*) AS n FROM posts")).rows[0].n,
		).toBe(0);
		expect(uploads).toBe(0);
		fail = true;
		await expect(importInstagram(options)).rejects.toThrow(
			"Image download failed",
		);
		expect(
			(await db.execute("SELECT count(*) AS n FROM posts")).rows[0].n,
		).toBe(0);
		fail = false;
		await importInstagram(options);
		const before = (
			await db.execute("SELECT slug, description FROM posts ORDER BY slug")
		).rows;
		fail = true;
		await expect(importInstagram(options)).rejects.toThrow(
			"Image download failed",
		);
		expect(
			(await db.execute("SELECT slug, description FROM posts ORDER BY slug"))
				.rows,
		).toEqual(before);
	} finally {
		db.close();
	}
});

it("rejects unsafe image sources and corrupt images without publishing posts", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		let imageUrl = "http://images.fbcdn.net/file";
		const fetcher: typeof fetch = async (input) =>
			new URL(String(input)).hostname === "graph.facebook.com"
				? Response.json({
						data: [
							{
								id: "1",
								timestamp: "2024-01-01T00:00:00+0000",
								media_type: "IMAGE",
								permalink: "https://www.instagram.com/p/test/",
								media_url: imageUrl,
							},
						],
					})
				: new Response("not an image");
		const options = {
			db,
			putImage: async () => {},
			accountId: "123",
			token: "token",
			fetcher,
		};
		await expect(importInstagram(options)).rejects.toThrow(
			"Invalid image source",
		);
		imageUrl = "https://images.fbcdn.net/file";
		await expect(importInstagram(options)).rejects.toThrow("Invalid image");
		expect(
			(await db.execute("SELECT count(*) AS n FROM posts")).rows[0].n,
		).toBe(0);
	} finally {
		db.close();
	}
});

it("keeps existing posts when an upstream response is incomplete or unsupported", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		await db.execute({
			sql: "INSERT INTO posts VALUES (?,?,?,?)",
			args: ["instagram-9", "Existing", "2020-01-01", "Keep"],
		});
		await db.execute({
			sql: "INSERT INTO instagram_posts VALUES (?,?,?,?,?,?)",
			args: [
				"9",
				"instagram-9",
				"https://www.instagram.com/p/old/",
				"fingerprint",
				"IMAGE",
				"2024-01-01",
			],
		});
		let media: unknown[] = [];
		const fetcher: typeof fetch = async () => Response.json({ data: media });
		const options = {
			db,
			putImage: async () => {},
			accountId: "123",
			token: "token",
			fetcher,
		};
		expect(await importInstagram(options)).toMatchObject({ total: 0 });
		media = [
			{
				id: "1",
				timestamp: "2024-01-01T00:00:00+0000",
				media_type: "VIDEO",
				permalink: "https://www.instagram.com/p/video/",
			},
		];
		await expect(importInstagram(options)).rejects.toThrow(
			"Unsupported media type",
		);
		expect(
			(await db.execute("SELECT title, description FROM posts")).rows[0],
		).toMatchObject({ title: "Existing", description: "Keep" });
	} finally {
		db.close();
	}
});

it("imports media into a configured remote store without creating local image files", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		const jpeg = await sharp({
			create: { width: 4, height: 4, channels: 3, background: "red" },
		})
			.jpeg()
			.toBuffer();
		const objects = new Map<string, Buffer>();
		const fetcher: typeof fetch = async (input) =>
			new URL(String(input)).hostname === "graph.facebook.com"
				? Response.json({
						data: [
							{
								id: "1",
								timestamp: "2024-01-01T00:00:00+0000",
								media_type: "IMAGE",
								permalink: "https://www.instagram.com/p/test/",
								media_url: "https://images.fbcdn.net/file",
							},
						],
					})
				: new Response(jpeg);
		await importInstagram({
			db,
			accountId: "123",
			token: "token",
			fetcher,
			putImage: async (name, bytes) => {
				objects.set(name, bytes);
			},
		});
		expect(objects.size).toBe(2);
		expect(
			(await db.execute("SELECT count(*) AS n FROM posts")).rows[0].n,
		).toBe(1);
		await db.execute(
			"UPDATE posts SET description = 'Previous published content'",
		);
		await expect(
			importInstagram({
				db,
				accountId: "123",
				token: "token",
				fetcher,
				putImage: async () => {
					throw new Error("storage unavailable");
				},
			}),
		).rejects.toThrow("storage unavailable");
		expect(
			(await db.execute("SELECT description FROM posts")).rows[0].description,
		).toBe("Previous published content");
	} finally {
		db.close();
	}
});
