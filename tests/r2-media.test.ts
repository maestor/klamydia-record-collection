import { createClient } from "@libsql/client";
import { expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { migrate } from "../src/db.js";

it("redirects only published images to a short-lived private R2 URL without caching the redirect", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		const image = `/media/${"a".repeat(64)}.jpg`;
		const preview = `/media/${"b".repeat(64)}.jpg`;
		await db.execute({
			sql: "INSERT INTO posts VALUES (?, ?, ?, ?)",
			args: ["post", "Title", "2024-01-01", "Caption"],
		});
		await db.execute({
			sql: "INSERT INTO images VALUES (?, ?, ?, ?)",
			args: ["post", 1, image, "Cover"],
		});
		await db.execute({
			sql: "INSERT INTO instagram_images VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			args: ["post", 1, "123", 100, 100, "jpeg", "a".repeat(64), preview],
		});
		const app = createApp(db, "http://localhost:3000", {
			endpoint: "https://account.r2.cloudflarestorage.com",
			sign: async (key) =>
				`https://account.r2.cloudflarestorage.com/bucket/${key}?signature=temporary`,
		});
		const response = await app.request(image);
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toContain("?signature=temporary");
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect((await app.request(preview)).status).toBe(302);
		expect((await app.request(`/media/${"c".repeat(64)}.jpg`)).status).toBe(
			404,
		);
		const page = await app.request("/posts/post");
		expect(page.headers.get("content-security-policy")).toContain(
			"https://account.r2.cloudflarestorage.com",
		);
		const broken = createApp(db, "http://localhost:3000", {
			endpoint: "https://account.r2.cloudflarestorage.com",
			sign: async () => {
				throw new Error("secret");
			},
		});
		const failure = await broken.request(image);
		expect(failure.status).toBe(503);
		expect(failure.headers.get("cache-control")).toBe("no-store");
		expect(await failure.text()).not.toContain("secret");
	} finally {
		db.close();
	}
});
