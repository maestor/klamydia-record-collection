import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { createClient } from "@libsql/client";

const run = promisify(execFile);

test("the compiled Vercel entrypoint serves migrated data without a TS loader", async () => {
	const directory = await mkdtemp(join(tmpdir(), "collection-production-"));
	const url = `file:${join(directory, "collection.db")}`;
	const env = {
		...process.env,
		VERCEL: "0",
		NODE_OPTIONS: "",
		DATABASE_URL: url,
		SITE_URL: "https://collection.example",
		R2_ENDPOINT: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`,
		R2_BUCKET: "collection",
		R2_READ_ACCESS_KEY_ID: "test-id",
		R2_READ_SECRET_ACCESS_KEY: "test-secret",
	};
	try {
		await run(
			process.execPath,
			["--conditions=development", "--import", "tsx", "scripts/migrate.ts"],
			{ env },
		);
		const db = createClient({ url });
		try {
			await db.execute(
				"INSERT INTO posts VALUES ('production', 'Tuotantolevy', '2026-01-01', 'Kuvaus')",
			);
		} finally {
			db.close();
		}
		const { stdout } = await run(
			process.execPath,
			[
				"--input-type=module",
				"-e",
				`
			import app from './app.js';
			const response = await app.request('/posts/production');
			const html = await response.text();
			console.log(JSON.stringify({status: response.status, html, cache: response.headers.get('cache-control')}));
		`,
			],
			{ env },
		);
		const response = JSON.parse(stdout);
		assert.equal(response.status, 200);
		assert.match(response.html, /Tuotantolevy/);
		assert.match(
			response.html,
			/https:\/\/collection.example\/posts\/production/,
		);
		assert.match(response.cache, /s-maxage=300/);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
