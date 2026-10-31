import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { expect, it } from "vitest";
import { migrate } from "../src/db.js";
import { createRuntime } from "../src/runtime.js";

it("creates a remote runtime without opening a local file or issuing write pragmas", async () => {
	const { app, db } = await createRuntime({
		VERCEL: "1",
		DATABASE_URL: "libsql://collection.example",
		DATABASE_AUTH_TOKEN: "test-token",
		SITE_URL: "https://collection.example",
		R2_ENDPOINT: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`,
		R2_BUCKET: "collection",
		R2_READ_ACCESS_KEY_ID: "test-id",
		R2_READ_SECRET_ACCESS_KEY: "test-secret",
	});
	try {
		expect(db.protocol).toBe("http");
		expect((await app.request("/missing")).status).toBe(404);
	} finally {
		db.close();
	}
});

it("serves an existing collection using a read-only runtime connection", async () => {
	const directory = await mkdtemp(join(tmpdir(), "collection-runtime-"));
	const url = `file:${join(directory, "collection.db")}`;
	const writer = createClient({ url });
	try {
		await migrate(writer);
		await writer.execute(
			"INSERT INTO posts VALUES ('record', 'Tuotantolevy', '2026-01-01', 'Kuvaus')",
		);
		const { app, db } = await createRuntime({
			DATABASE_URL: url,
			SITE_URL: "https://collection.example",
			R2_ENDPOINT: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`,
			R2_BUCKET: "collection",
			R2_READ_ACCESS_KEY_ID: "test-id",
			R2_READ_SECRET_ACCESS_KEY: "test-secret",
		});
		try {
			const page = await app.request("/posts/record");
			expect(page.status).toBe(200);
			expect(await page.text()).toContain("Tuotantolevy");
			expect(page.headers.get("cache-control")).toContain("s-maxage=300");
			expect(await (await app.request("/sitemap.xml")).text()).toContain(
				"https://collection.example/posts/record",
			);
			await expect(db.execute("DELETE FROM posts")).rejects.toThrow();
		} finally {
			db.close();
		}
		await expect(createRuntime({ DATABASE_URL: url })).rejects.toThrow(
			/R2_ENDPOINT/,
		);
		await expect(
			createRuntime({ DATABASE_URL: `file:${join(directory, "missing.db")}` }),
		).rejects.toThrow();
	} finally {
		writer.close();
		await rm(directory, { recursive: true, force: true });
	}
});
