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
			expect(document.querySelector("h1 script")).toBeNull();
			expect(
				[...document.querySelectorAll("script")].every(
					(script) => script.src && !script.textContent,
				),
			).toBe(true);
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

it("shows a cleaned reading view while preserving the source description", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		const source = "Otsikko\n\nTeksti #punk.\n\n#punk #levy";
		await db.execute({
			sql: "INSERT INTO posts VALUES (?, ?, ?, ?)",
			args: ["clean", "Otsikko", "2026-09-01T22:00:00Z", source],
		});
		await db.execute({
			sql: "INSERT INTO instagram_posts VALUES (?, ?, ?, ?, ?, ?)",
			args: [
				"1",
				"clean",
				"https://www.instagram.com/p/test/",
				"x",
				"IMAGE",
				"2026-01-01",
			],
		});
		await db.execute("INSERT INTO tags VALUES ('punk', 'Punk')");
		await db.execute("INSERT INTO post_tags VALUES ('clean', 'punk')");
		const response = await createApp(db).request("/posts/clean");
		document.documentElement.innerHTML = await response.text();
		expect(document.querySelector(".description")?.textContent).toBe(
			"Teksti punk.",
		);
		expect(document.querySelector("time")?.textContent).toBe("2.9.2026");
		expect(within(document.body).getByText("Punk")).toBeTruthy();
		expect(
			within(document.body)
				.getByRole("link", { name: "Alkuperäinen julkaisu" })
				.getAttribute("href"),
		).toBe("https://www.instagram.com/p/test/");
		expect(document.querySelector("details")).toBeNull();
		const tags = within(document.body).getByRole("list", {
			name: "Tunnisteet",
		});
		expect(within(tags).queryByRole("link")).toBeNull();
		expect(
			within(document.body)
				.getByRole("link", { name: "Alkuperäinen julkaisu" })
				.querySelector("svg")
				?.getAttribute("aria-hidden"),
		).toBe("true");
		expect(document.querySelector("time")?.getAttribute("datetime")).toBe(
			"2026-09-01T22:00:00Z",
		);
		expect(
			(await db.execute("SELECT description FROM posts")).rows[0].description,
		).toBe(source);
	} finally {
		db.close();
	}
});

it("uses the stored aspect ratio and responsive preview for a post image", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		await db.execute({
			sql: "INSERT INTO posts VALUES (?, ?, ?, ?)",
			args: ["portrait", "Levy", "2026-01-01", "Teksti"],
		});
		const full = `/media/${"d".repeat(64)}.jpg`;
		const preview = `/media/${"e".repeat(64)}.jpg`;
		await db.execute({
			sql: "INSERT INTO images VALUES (?, ?, ?, ?)",
			args: ["portrait", 1, full, "Kansi"],
		});
		await db.execute({
			sql: "INSERT INTO instagram_images VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			args: ["portrait", 1, "10", 800, 1200, "jpeg", "hash", preview],
		});
		document.documentElement.innerHTML = await (
			await createApp(db).request("/posts/portrait")
		).text();
		const img = within(document.body).getByRole("img", { name: "Kansi" });
		expect(img.getAttribute("width")).toBe("427");
		expect(img.getAttribute("height")).toBe("640");
		expect(img.getAttribute("srcset")).toBe(`${preview} 427w, ${full} 800w`);
	} finally {
		db.close();
	}
});

it("uses an honest per-image fallback without overwriting owner descriptions", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		await db.execute({
			sql: "INSERT INTO posts VALUES (?,?,?,?)",
			args: ["fallback", "Levyn nimi", "2026-01-01", "Teksti"],
		});
		await db.execute({
			sql: "INSERT INTO images VALUES (?,?,?,?),(?,?,?,?)",
			args: [
				"fallback",
				1,
				`/media/${"a".repeat(64)}.jpg`,
				"Julkaisun kuva 1",
				"fallback",
				2,
				`/media/${"b".repeat(64)}.jpg`,
				"Omistajan kuvaus",
			],
		});
		document.documentElement.innerHTML = await (
			await createApp(db).request("/posts/fallback")
		).text();
		expect(
			within(document.body).getByRole("img", {
				name: "Julkaisun Levyn nimi kuva 1 / 2",
			}),
		).toBeTruthy();
		expect(
			within(document.body).getByRole("img", { name: "Omistajan kuvaus" }),
		).toBeTruthy();
	} finally {
		db.close();
	}
});
