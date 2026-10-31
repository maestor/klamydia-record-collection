import { createClient } from "@libsql/client";
import { within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";
import { migrate } from "../src/db.js";
import { messages as m } from "../src/i18n/fi.js";
import { createTestApp as createApp } from "./helpers.js";

it("serves full HTML documents in standards mode", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		const app = createApp(db);
		for (const path of [
			"/",
			"/archive",
			"/about",
			"/posts/missing",
			"/archive?page=0",
		]) {
			const response = await app.request(path);
			expect(await response.text()).toMatch(/^<!doctype html>/i);
		}
	} finally {
		db.close();
	}
});

it("shows the collection title and default description on the front page", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		const response = await createApp(db).request("/");
		document.documentElement.innerHTML = await response.text();
		expect(document.title).toBe(
			"Klamydiakokoelma – Kattava taudinkuva Klamydia-orkesterin musiikkiäänitteiden muodossa",
		);
		expect(
			within(document.body).getByRole("heading", {
				level: 1,
				name: "Klamydiakokoelma",
			}),
		).toBeTruthy();
		expect(
			document
				.querySelector('meta[name="description"]')
				?.getAttribute("content"),
		).toBe(
			"Klamydia-äänitekeräilijän levykokoelman esittely tarinoiden ja kuvien muodossa.",
		);
		expect(
			Array.from(
				document.querySelectorAll("head link[rel=stylesheet], head script"),
			).map(
				(element) =>
					element.getAttribute("href") || element.getAttribute("src"),
			),
		).toEqual(["/assets/style.css", "/assets/theme.js", "/assets/images.js"]);
	} finally {
		db.close();
	}
});

describe("collection browsing", () => {
	it("shows recent posts and paginates the archive newest first", async () => {
		const db = createClient({ url: "file::memory:" });
		try {
			await migrate(db);
			for (let i = 1; i <= 27; i++)
				await db.execute({
					sql: "INSERT INTO posts VALUES (?, ?, ?, ?)",
					args: [
						`demo-${i}`,
						`Esimerkki ${i}`,
						`2026-01-${String(i).padStart(2, "0")}`,
						"Kuvitteellinen kuvaus",
					],
				});
			const app = createApp(db);
			let response = await app.request("/");
			expect(response.status).toBe(200);
			document.documentElement.innerHTML = await response.text();
			expect(
				within(document.body)
					.getByRole("link", { name: "Esimerkki 27" })
					.getAttribute("href"),
			).toBe("/posts/demo-27");
			expect(
				within(document.body)
					.getAllByRole("link", { name: m.archive })
					.map((link) => link.getAttribute("href")),
			).toEqual(["/archive", "/archive"]);
			for (const number of [1, 2]) {
				const result = await app.request(`/archive?page=${number}`);
				document.documentElement.innerHTML = await result.text();
				expect(
					within(within(document.body).getByRole("main")).getAllByRole(
						"heading",
						{ level: 2 },
					),
				).toHaveLength(12);
			}
			response = await app.request("/archive?page=3");
			expect(response.status).toBe(200);
			document.documentElement.innerHTML = await response.text();
			const main = within(within(document.body).getByRole("main"));
			expect(
				main.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
			).toEqual(["Esimerkki 3", "Esimerkki 2", "Esimerkki 1"]);
			expect(
				main.getByRole("link", { name: m.newer }).getAttribute("href"),
			).toBe("/archive?page=2");
		} finally {
			db.close();
		}
	});
});

it("explains an empty archive and rejects invalid page numbers without caching errors", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		const app = createApp(db);
		let response = await app.request("/archive");
		document.documentElement.innerHTML = await response.text();
		expect(within(document.body).getByText(m.empty)).toBeTruthy();
		for (const page of ["0", "-1", "abc", "1.5", "1000000"]) {
			response = await app.request(`/archive?page=${page}`);
			expect(response.status).toBe(400);
			expect(response.headers.get("cache-control")).toBe("no-store");
		}
	} finally {
		db.close();
	}
});

it("publishes canonical post URLs and a sitemap using the configured origin", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		await db.execute({
			sql: "INSERT INTO posts VALUES (?, ?, ?, ?)",
			args: ["demo", "Esimerkki", "2026-01-01", "Esimerkkiteksti"],
		});
		const app = createApp(db, "https://example.test");
		const page = await app.request("/posts/demo?page=3");
		document.documentElement.innerHTML = await page.text();
		expect(
			document.querySelector("link[rel=canonical]")?.getAttribute("href"),
		).toBe("https://example.test/posts/demo");
		expect(
			within(document.body)
				.getByRole("link", { name: m.backArchive })
				.getAttribute("href"),
		).toBe("/archive?page=3");
		const sitemap = await app.request("/sitemap.xml");
		expect(sitemap.headers.get("content-type")).toContain("application/xml");
		const sitemapXml = await sitemap.text();
		expect(sitemapXml).toContain('href="/assets/sitemap.css"');
		expect(sitemapXml).toContain("<loc>https://example.test/posts/demo</loc>");
	} finally {
		db.close();
	}
});

it("shows the first preview as a linked card and offers the complete archive", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		await db.execute({
			sql: "INSERT INTO posts VALUES (?, ?, ?, ?)",
			args: ["record", "Levy", "2026-09-01T22:00:00Z", "Kuvaus"],
		});
		const original = `/media/${"a".repeat(64)}.jpg`;
		const preview = `/media/${"b".repeat(64)}.jpg`;
		await db.execute({
			sql: "INSERT INTO images VALUES (?, ?, ?, ?), (?, ?, ?, ?)",
			args: [
				"record",
				1,
				original,
				"Kansi",
				"record",
				2,
				`/media/${"c".repeat(64)}.jpg`,
				"Toinen",
			],
		});
		await db.execute({
			sql: "INSERT INTO instagram_images VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			args: ["record", 1, "11", 1200, 800, "jpeg", "hash", preview],
		});
		await db.execute({
			sql: "INSERT INTO posts VALUES (?, ?, ?, ?)",
			args: ["older", "Vanhempi", "2026-01-01", "Teksti"],
		});
		await db.execute({
			sql: "INSERT INTO images VALUES (?, ?, ?, ?)",
			args: ["older", 1, original, "Kansi"],
		});
		const app = createApp(db);
		for (const path of ["/", "/archive"]) {
			document.documentElement.innerHTML = await (
				await app.request(path)
			).text();
			const link = within(document.body).getByRole("link", { name: /Levy/ });
			expect(link.getAttribute("href")).toBe("/posts/record");
			const image = link.querySelector("img");
			expect(image?.getAttribute("src")).toBe(preview);
			expect(image?.getAttribute("alt")).toBe("");
			expect(image?.getAttribute("width")).toBe("640");
			expect(image?.getAttribute("height")).toBe("427");
			expect(image?.getAttribute("loading")).toBe("eager");
			expect(link.closest("article")?.textContent).toContain(m.imageCount(2));
			const olderImage = within(document.body)
				.getByRole("link", { name: "Vanhempi" })
				.querySelector("img");
			expect(olderImage?.getAttribute("loading")).toBe("lazy");
			expect(olderImage?.getAttribute("width")).toBeNull();
			expect(olderImage?.getAttribute("height")).toBeNull();
		}
		document.documentElement.innerHTML = await (await app.request("/")).text();
		expect(
			within(document.body)
				.getByRole("link", { name: m.allPosts })
				.getAttribute("href"),
		).toBe("/archive");
	} finally {
		db.close();
	}
});

it("continues with ordinary navigation after twenty accumulated archive batches", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		await db.batch(
			Array.from({ length: 241 }, (_, index) => ({
				sql: "INSERT INTO posts VALUES (?, ?, ?, ?)",
				args: [`record-${index}`, `Levy ${index}`, "2026-01-01", "Teksti"],
			})),
		);
		const app = createApp(db);
		document.documentElement.innerHTML = await (
			await app.request("/archive?page=1&through=20")
		).text();
		const next = within(document.body).getByRole("link", {
			name: m.nextPage,
		});
		expect(next.getAttribute("href")).toBe("/archive?page=21");
		expect(next.getAttribute("data-enhance")).toBe("false");
		expect(document.querySelectorAll(".post-card")).toHaveLength(240);
		document.documentElement.innerHTML = await (
			await app.request("/archive?page=21")
		).text();
		expect(
			within(document.body).getByText(m.archiveEnd, {
				exact: true,
			}),
		).toBeTruthy();
		expect(document.querySelectorAll(".post-card")).toHaveLength(1);
	} finally {
		db.close();
	}
});

it("reconstructs a bounded archive range and serves separate append fragments", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		for (let i = 1; i <= 27; i++)
			await db.execute({
				sql: "INSERT INTO posts VALUES (?, ?, ?, ?)",
				args: [
					`demo-${i}`,
					`Levy ${i}`,
					`2026-01-${String(i).padStart(2, "0")}`,
					"Kuvaus",
				],
			});
		const app = createApp(db);
		const full = await app.request("/archive?page=1&through=2");
		expect(full.status).toBe(200);
		document.documentElement.innerHTML = await full.text();
		expect(document.querySelectorAll(".post-card")).toHaveLength(24);
		expect(
			within(document.body)
				.getByRole("link", { name: "Levy 27" })
				.getAttribute("href"),
		).toBe("/posts/demo-27?page=1&through=2");
		expect(
			within(document.body)
				.getByRole("link", { name: m.loadMore })
				.getAttribute("href"),
		).toBe("/archive?page=3");
		const post = await app.request("/posts/demo-27?page=1&through=2");
		document.documentElement.innerHTML = await post.text();
		expect(
			within(document.body)
				.getByRole("link", { name: m.backArchive })
				.getAttribute("href"),
		).toBe("/archive?page=1&through=2");
		const fragment = await app.request("/archive/fragments?page=2&start=1");
		const html = await fragment.text();
		expect(fragment.status).toBe(200);
		expect(html).not.toContain("<html");
		expect(fragment.headers.get("x-archive-count")).toBe("12");
		expect(fragment.headers.get("x-archive-has-more")).toBe("true");
		const box = document.createElement("ul");
		box.innerHTML = html;
		expect(box.querySelectorAll(".post-card")).toHaveLength(12);
		for (const path of [
			"/archive?page=2&through=1",
			"/archive?page=1&through=21",
			"/archive?through=2",
			"/archive/fragments?page=21&start=1",
			"/archive/fragments?page=2",
		]) {
			const response = await app.request(path);
			expect(response.status).toBe(400);
			expect(response.headers.get("cache-control")).toBe("no-store");
		}
	} finally {
		db.close();
	}
});

it("filters archive posts by tag and preserves the selection in navigation", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		await db.execute(
			"INSERT INTO tags VALUES ('punk rock', 'Punk Rock'), ('other', 'Other')",
		);
		for (let i = 1; i <= 14; i++) {
			await db.execute({
				sql: "INSERT INTO posts VALUES (?, ?, ?, ?)",
				args: [
					`tag-${i}`,
					`Tagged ${i}`,
					`2026-01-${String(i).padStart(2, "0")}`,
					"Description",
				],
			});
			await db.execute({
				sql: "INSERT INTO post_tags VALUES (?, ?)",
				args: [`tag-${i}`, i === 1 ? "other" : "punk rock"],
			});
		}
		const app = createApp(db);
		document.documentElement.innerHTML = await (
			await app.request("/archive?tag=punk%20rock")
		).text();
		expect(
			within(document.body).getByText("Hae aihetunnisteilla"),
		).toBeTruthy();
		expect(
			within(document.body).queryByRole("link", { name: "Tagged 1" }),
		).toBeNull();
		expect(
			within(document.body)
				.getByRole("link", { name: m.loadMore })
				.getAttribute("href"),
		).toContain("tag=punk");
		const post = within(document.body)
			.getByRole("link", { name: "Tagged 14" })
			.getAttribute("href");
		document.documentElement.innerHTML = await (
			await app.request(post ?? "")
		).text();
		expect(
			within(document.body)
				.getByRole("link", { name: m.backArchive })
				.getAttribute("href"),
		).toContain("tag=punk");
		expect(
			within(document.body)
				.getByRole("link", { name: "Punk Rock" })
				.getAttribute("href"),
		).toContain("tag=punk");
		const fragment = await app.request(
			"/archive/fragments?page=2&start=1&tag=punk%20rock",
		);
		expect(await fragment.text()).toContain("Tagged 2");
		document.documentElement.innerHTML = await (
			await app.request("/archive?tag=missing")
		).text();
		expect(within(document.body).getByText(m.emptyTag)).toBeTruthy();
		expect(
			within(document.body)
				.getByRole("link", { name: m.removeTag("missing") })
				.getAttribute("href"),
		).toBe("/archive");
	} finally {
		db.close();
	}
});

it("shows tag counts in the archive, ordered by popularity then Finnish alphabet", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		await db.execute(
			"INSERT INTO tags VALUES ('a', 'Ääni'), ('b', 'Öljy'), ('c', 'Aalto')",
		);
		await db.execute(
			"INSERT INTO posts VALUES ('one', 'One', '2026-01-01', ''), ('two', 'Two', '2026-01-02', ''), ('three', 'Three', '2026-01-03', '')",
		);
		await db.execute(
			"INSERT INTO post_tags VALUES ('one', 'a'), ('one', 'b'), ('one', 'c'), ('two', 'b')",
		);
		const app = createApp(db);
		document.documentElement.innerHTML = await (
			await app.request("/archive")
		).text();
		const list = within(document.body).getByRole("list", {
			name: m.tags,
			hidden: true,
		});
		expect(
			within(list)
				.getAllByRole("link", { hidden: true })
				.map((link) => link.textContent?.trim()),
		).toEqual(["Öljy (2)", "Aalto (1)", "Ääni (1)"]);
		document.documentElement.innerHTML = await (
			await app.request("/posts/one")
		).text();
		expect(
			within(document.body).getByRole("link", { name: "Öljy" }),
		).toBeTruthy();
	} finally {
		db.close();
	}
});

it("hides tags shared by every archive post but keeps post links usable", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		await db.execute(
			"INSERT INTO tags VALUES ('common', 'Common Tag'), ('rare', 'Rare')",
		);
		await db.execute(
			"INSERT INTO posts VALUES ('one', 'One', '2026-01-01', ''), ('two', 'Two', '2026-01-02', ''), ('about', 'About', '2026-01-03', '')",
		);
		await db.execute(
			"INSERT INTO instagram_posts VALUES ('17970239393043334', 'about', 'https://www.instagram.com/p/example/', 'fixture', 'IMAGE', '2026-01-03')",
		);
		await db.execute(
			"INSERT INTO post_tags VALUES ('one', 'common'), ('two', 'common'), ('one', 'rare')",
		);
		const app = createApp(db);
		document.documentElement.innerHTML = await (
			await app.request("/archive")
		).text();
		const list = within(document.body).getByRole("list", {
			name: m.tags,
			hidden: true,
		});
		expect(within(list).queryByText(/Common Tag/)).toBeNull();
		expect(within(list).getByText("Rare (1)")).toBeTruthy();
		document.documentElement.innerHTML = await (
			await app.request("/posts/one")
		).text();
		const href = within(document.body)
			.getByRole("link", { name: "Common Tag" })
			.getAttribute("href");
		expect(href).toBe("/archive?tag=common");
		document.documentElement.innerHTML = await (
			await app.request(href ?? "")
		).text();
		expect(
			within(document.body).getByRole("link", {
				name: m.removeTag("Common Tag"),
			}),
		).toBeTruthy();
		expect(
			within(document.body).getByRole("link", { name: "One" }),
		).toBeTruthy();
		expect(
			within(document.body).getByRole("link", { name: "Two" }),
		).toBeTruthy();
		await db.execute("DELETE FROM post_tags WHERE tag_normalized = 'rare'");
		document.documentElement.innerHTML = await (
			await app.request("/archive")
		).text();
		expect(within(document.body).queryByText(m.filterTags)).toBeNull();
		document.documentElement.innerHTML = await (
			await app.request("/archive?tag=common")
		).text();
		expect(
			within(document.body).getByRole("link", {
				name: m.removeTag("Common Tag"),
			}),
		).toBeTruthy();
	} finally {
		db.close();
	}
});
