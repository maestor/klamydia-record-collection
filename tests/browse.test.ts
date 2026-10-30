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
