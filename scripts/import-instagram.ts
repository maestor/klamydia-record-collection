import { access } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { environment } from "../src/env.js";
import { importInstagram } from "../src/instagram-import.js";
import { r2Address, r2Client } from "../src/r2-reader.js";
import { putImmutable, verifyObject } from "./r2-store.js";

try {
	const args = process.argv.slice(2);
	let dryRun = false;
	let limit: number | undefined;
	let mediaId: string | undefined;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--dry-run") dryRun = true;
		else if (args[i] === "--full") {
			/* A full scan is the default. */
		} else if (args[i] === "--limit" && /^\d+$/.test(args[i + 1] ?? ""))
			limit = Number(args[++i]);
		else if (args[i] === "--media-id" && /^\d+$/.test(args[i + 1] ?? ""))
			mediaId = args[++i];
		else
			throw new Error(
				"Usage: npm run import:instagram -- [--dry-run] [--limit N | --media-id ID] [--full]",
			);
	}
	if (!process.env.DATABASE_URL)
		throw new Error(
			"Set DATABASE_URL to an existing local SQLite database; see docs/instagram-access.md.",
		);
	const { databaseUrl } = environment(process.env);
	let putImage:
		| ((filename: string, bytes: Buffer) => Promise<void>)
		| undefined;
	if (!dryRun) {
		const address = r2Address(process.env);
		const writer = r2Client(
			address,
			process.env.R2_ACCESS_KEY_ID,
			process.env.R2_SECRET_ACCESS_KEY,
		);
		const reader = r2Client(
			address,
			process.env.R2_READ_ACCESS_KEY_ID,
			process.env.R2_READ_SECRET_ACCESS_KEY,
		);
		putImage = async (filename, bytes) => {
			try {
				await putImmutable(writer, address, filename, bytes);
				await verifyObject(reader, address, filename, bytes);
			} catch {
				throw new Error(
					`R2 upload or read verification failed for ${filename}.`,
				);
			}
		};
	}
	await access(databaseUrl.slice(5));
	const db = createClient({ url: databaseUrl });
	try {
		await db.execute("SELECT id FROM import_runs LIMIT 1");
		console.log(
			`Local database: ${databaseUrl}; mode: ${dryRun ? "dry run" : "import"}`,
		);
		const run = dryRun
			? undefined
			: await db.execute({
					sql: "INSERT INTO import_runs (started_at,status,summary) VALUES (?,?,?)",
					args: [new Date().toISOString(), "running", ""],
				});
		const runId = run?.lastInsertRowid;
		if (run && runId === undefined)
			throw new Error("Could not record the import run.");
		try {
			const result = await importInstagram({
				db,
				accountId: process.env.INSTAGRAM_ACCOUNT_ID ?? "",
				token: process.env.INSTAGRAM_ACCESS_TOKEN ?? "",
				limit,
				mediaId,
				putImage,
				dryRun,
			});
			if (runId !== undefined)
				await db.execute({
					sql: "UPDATE import_runs SET finished_at=?,status=?,summary=? WHERE id=?",
					args: [
						new Date().toISOString(),
						"success",
						JSON.stringify(result),
						runId,
					],
				});
			console.log(JSON.stringify(result));
		} catch (error) {
			if (runId !== undefined)
				await db.execute({
					sql: "UPDATE import_runs SET finished_at=?,status=?,summary=? WHERE id=?",
					args: [
						new Date().toISOString(),
						"failed",
						"Import failed; see operator output.",
						runId,
					],
				});
			throw error;
		}
	} finally {
		db.close();
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : "Import failed.");
	process.exitCode = 1;
}
