import { createClient } from "@libsql/client";
import { within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";
import { migrate } from "../src/db.js";
import { createTestApp as createApp } from "./helpers.js";

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
					.getByRole("link", { name: "Arkisto" })
					.getAttribute("href"),
			).toBe("/archive");
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
				main.getByRole("link", { name: "Uudemmat" }).getAttribute("href"),
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
		expect(
			within(document.body).getByText("Julkaisuja ei vielä ole."),
		).toBeTruthy();
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
				.getByRole("link", { name: "Takaisin arkistoon" })
				.getAttribute("href"),
		).toBe("/archive?page=3");
		const sitemap = await app.request("/sitemap.xml");
		expect(sitemap.headers.get("content-type")).toContain("application/xml");
		expect(await sitemap.text()).toContain(
			"<loc>https://example.test/posts/demo</loc>",
		);
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
			expect(link.closest("article")?.textContent).toContain("2 kuvaa");
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
				.getByRole("link", { name: "Kaikki julkaisut" })
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
			name: "Seuraavat julkaisut",
		});
		expect(next.getAttribute("href")).toBe("/archive?page=21");
		expect(next.getAttribute("data-enhance")).toBe("false");
		expect(document.querySelectorAll(".post-card")).toHaveLength(240);
		document.documentElement.innerHTML = await (
			await app.request("/archive?page=21")
		).text();
		expect(
			within(document.body).getByText("Kaikki julkaisut näytetty.", {
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
				.getByRole("link", { name: "Näytä lisää" })
				.getAttribute("href"),
		).toBe("/archive?page=3");
		const post = await app.request("/posts/demo-27?page=1&through=2");
		document.documentElement.innerHTML = await post.text();
		expect(
			within(document.body)
				.getByRole("link", { name: "Takaisin arkistoon" })
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
