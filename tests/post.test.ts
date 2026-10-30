import { createClient } from "@libsql/client";
import { within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";
import { migrate } from "../src/db.js";
import { createTestApp as createApp } from "./helpers.js";

describe("post page", () => {
	it("lets a visitor read the complete description and identify images in order", async () => {
		const db = createClient({ url: "file::memory:" });
		await migrate(db);
		await db.execute({
			sql: "INSERT INTO posts (slug, title, published_at, description) VALUES (?, ?, ?, ?)",
			args: [
				"esimerkki",
				"Esimerkkijulkaisu",
				"2026-01-01",
				"Ensimmäinen kappale.\n\nToinen kappale & <teksti>.",
			],
		});
		await db.execute({
			sql: "INSERT INTO images (post_slug, position, url, alt) VALUES (?, ?, ?, ?), (?, ?, ?, ?)",
			args: [
				"esimerkki",
				1,
				`/media/${"a".repeat(64)}.jpg`,
				"Ensimmäinen kuva",
				"esimerkki",
				2,
				`/media/${"b".repeat(64)}.jpg`,
				"Toinen kuva",
			],
		});
		const response = await createApp(db).request("/posts/esimerkki");
		expect(response.status).toBe(200);
		document.documentElement.innerHTML = await response.text();
		const page = within(document.body);
		expect(
			page.getByRole("heading", { name: "Esimerkkijulkaisu" }),
		).toBeTruthy();
		expect(page.getByText(/Ensimmäinen kappale/).textContent).toContain(
			"Toinen kappale & <teksti>.",
		);
		expect(
			page.getAllByRole("img").map((img) => img.getAttribute("alt")),
		).toEqual(["Ensimmäinen kuva", "Toinen kuva"]);
		db.close();
	});
});

describe("public response protections", () => {
	it("escapes data, applies a restrictive policy and does not cache missing pages", async () => {
		const db = createClient({ url: "file::memory:" });
		try {
			await migrate(db);
			await db.execute({
				sql: "INSERT INTO posts VALUES (?, ?, ?, ?)",
				args: [
					"safe",
					"<script>alert(1)</script>",
					"2026-01-01",
					"Teksti <img src=x onerror=alert(1)>",
				],
			});
			const app = createApp(db);
			const response = await app.request("/posts/safe");
			const html = await response.text();
			document.documentElement.innerHTML = html;
			expect(document.querySelector("script")).toBeNull();
			expect(document.querySelector("h1")?.textContent).toBe(
				"<script>alert(1)</script>",
			);
			expect(response.headers.get("content-security-policy")).toContain(
				"default-src 'none'",
			);
			expect(response.headers.get("cache-control")).toContain("s-maxage=300");
			const missing = await app.request("/posts/missing");
			expect(missing.status).toBe(404);
			expect(missing.headers.get("cache-control")).toBe("no-store");
		} finally {
			db.close();
		}
	});
});
