import { access } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { environment } from "../src/env.js";
import { r2Address, r2Client } from "../src/r2-reader.js";
import { copyCollectionMedia } from "./copy-r2-media.js";
import { putImmutable, retryTransient, verifyObject } from "./r2-store.js";

try {
	const args = process.argv.slice(2);
	if (args.length > 1 || (args.length === 1 && args[0] !== "--apply"))
		throw new Error("Usage: npm run r2:copy -- [--apply]");
	if (!process.env.DATABASE_URL)
		throw new Error(
			"Set DATABASE_URL to the existing local collection database.",
		);
	const { databaseUrl } = environment(process.env);
	await access(databaseUrl.slice(5));
	const db = createClient({ url: databaseUrl });
	try {
		let put = async (_filename: string, _bytes: Buffer) => {};
		let verify = async (_filename: string, _bytes: Buffer) => {};
		if (args.includes("--apply")) {
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
			let progress = 0;
			put = async (filename, bytes) => {
				try {
					await retryTransient(() =>
						putImmutable(writer, address, filename, bytes),
					);
				} catch (error) {
					const status = (error as { $metadata?: { httpStatusCode?: number } })
						.$metadata?.httpStatusCode;
					const safe =
						error instanceof Error &&
						/^R2 (upload failed \(HTTP (?:\d+|unknown)\)|object (?:size|hash) mismatch)/.test(
							error.message,
						)
							? error.message.split(":")[0]
							: `R2 operation failed (HTTP ${status ?? "unknown"})`;
					throw new Error(`${safe}: ${filename}`);
				}
			};
			verify = async (filename, bytes) => {
				try {
					await retryTransient(() =>
						verifyObject(reader, address, filename, bytes),
					);
				} catch {
					throw new Error(`R2 read-only verification failed: ${filename}`);
				}
				if (++progress % 50 === 0) console.log(`Verified ${progress} objects.`);
			};
			console.log(
				`Copying collection media to bucket ${address.bucket}, prefix collection/media/.`,
			);
		} else
			console.log(
				"Dry run: validating local collection media; no remote writes.",
			);
		const result = await copyCollectionMedia(db, ".data/media", put, verify);
		console.log(JSON.stringify(result));
	} finally {
		db.close();
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : "R2 copy failed.");
	process.exitCode = 1;
}
