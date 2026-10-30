import { createClient } from "@libsql/client";
import { within } from "@testing-library/dom";
import { expect, it } from "vitest";
import { migrate } from "../src/db.js";
import { createTestApp } from "./helpers.js";

const mediaId = "17970239393043334";
const slug = `instagram-${mediaId}`;

it("presents the introduction as About and excludes it from browsing", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		await db.execute({
			sql: "INSERT INTO posts VALUES (?, ?, ?, ?)",
			args: [
				slug,
				"Johdanto",
				"2023-01-02T21:02:02Z",
				"Kokoelma & <teksti>.\n\n#klamydia",
			],
		});
		await db.execute({
			sql: "INSERT INTO instagram_posts VALUES (?, ?, ?, ?, ?, ?)",
			args: [
				mediaId,
				slug,
				"https://www.instagram.com/p/example/",
				"x",
				"IMAGE",
				"2023-01-02",
			],
		});
		const image = `/media/${"a".repeat(64)}.jpg`;
		await db.execute({
			sql: "INSERT INTO images VALUES (?, ?, ?, ?)",
			args: [slug, 1, image, "vanha alt"],
		});
		for (let i = 1; i <= 13; i++)
			await db.execute({
				sql: "INSERT INTO posts VALUES (?, ?, ?, ?)",
				args: [
					`record-${i}`,
					`Levy ${i}`,
					`2024-01-${String(i).padStart(2, "0")}`,
					"Kuvaus",
				],
			});
		await db.execute({
			sql: "INSERT INTO posts VALUES (?, ?, ?, ?)",
			args: ["older", "Vanhempi levy", "2022-01-01", "Kuvaus"],
		});
		const app = createTestApp(db, "https://example.test");
		const response = await app.request("/about");
		expect(response.status).toBe(200);
		document.documentElement.innerHTML = await response.text();
		const page = within(document.body);
		expect(
			page.getByRole("heading", { name: "Tietoa kokoelmasta" }),
		).toBeTruthy();
		expect(page.getByText("Kirjoitettu 2.1.2023")).toBeTruthy();
		expect(
			page
				.getByRole("img", { name: "Klamydia-kaseteista tehty kello" })
				.getAttribute("src"),
		).toBe(image);
		expect(page.getByText("Kokoelma & <teksti>.")).toBeTruthy();
		expect(document.querySelector(".description")?.textContent).not.toContain(
			"#klamydia",
		);
		expect(document.querySelector(".gallery, .tags")).toBeNull();
		expect(
			page
				.getByRole("link", { name: "Seuraa instagramissa" })
				.getAttribute("href"),
		).toBe("https://www.instagram.com/klamydiakokoelma/");
		expect(
			page.getByRole("link", { name: "Tietoa" }).getAttribute("href"),
		).toBe("/about");
		expect(
			document.querySelector("link[rel=canonical]")?.getAttribute("href"),
		).toBe("https://example.test/about");
		for (const path of [
			"/",
			"/archive",
			"/archive?page=2",
			"/archive/fragments?page=2&start=1",
		]) {
			const html = await (await app.request(path)).text();
			expect(html).not.toContain(`/posts/${slug}`);
			if (path.includes("page=2")) expect(html).toContain("Vanhempi levy");
		}
		const fragment = await app.request("/archive/fragments?page=2&start=1");
		expect(fragment.headers.get("x-archive-count")).toBe("2");
		const old = await app.request(`/posts/${slug}`);
		expect(old.status).toBe(302);
		expect(old.headers.get("location")).toBe("/about");
		expect(old.headers.get("cache-control")).toBe("no-store");
		const sitemap = await (await app.request("/sitemap.xml")).text();
		expect(sitemap).toContain("https://example.test/about");
		expect(sitemap).not.toContain(`/posts/${slug}`);
	} finally {
		db.close();
	}
});

it("explains when the introduction is unavailable without choosing another post", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		await db.execute({
			sql: "INSERT INTO posts VALUES (?, ?, ?, ?)",
			args: ["older", "Vanhempi levy", "2020-01-01", "Kuvaus"],
		});
		const response = await createTestApp(db).request("/about");
		expect(response.status).toBe(200);
		document.documentElement.innerHTML = await response.text();
		expect(
			within(document.body).getByText(
				"Tietoja kokoelmasta ei ole tällä hetkellä saatavilla.",
			),
		).toBeTruthy();
		expect(document.body.textContent).not.toContain("Vanhempi levy");
	} finally {
		db.close();
	}
});

it("keeps the introduction readable when its image is missing or invalid", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		await db.execute({
			sql: "INSERT INTO posts VALUES (?, ?, ?, ?)",
			args: [slug, "Johdanto", "2023-01-02", "Teksti"],
		});
		await db.execute({
			sql: "INSERT INTO instagram_posts VALUES (?, ?, ?, ?, ?, ?)",
			args: [
				mediaId,
				slug,
				"https://www.instagram.com/p/example/",
				"x",
				"IMAGE",
				"2023-01-02",
			],
		});
		const app = createTestApp(db);
		for (const invalid of [false, true]) {
			if (invalid)
				await db.execute({
					sql: "INSERT INTO images VALUES (?, ?, ?, ?)",
					args: [slug, 1, "https://invalid.example/image.jpg", "Kuva"],
				});
			document.documentElement.innerHTML = await (
				await app.request("/about")
			).text();
			expect(
				within(document.body).getByText("Kuvaa ei saatavilla"),
			).toBeTruthy();
			expect(within(document.body).getByText("Teksti")).toBeTruthy();
			expect(document.querySelector(".about-image img")).toBeNull();
		}
	} finally {
		db.close();
	}
});
