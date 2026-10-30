import { access } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { environment } from "../src/env.js";
import { r2Address, r2Client } from "../src/r2-reader.js";
import { downloadVerifiedObject, retryTransient } from "./r2-store.js";
import { restoreCollectionMedia } from "./restore-r2-media.js";

try {
	if (process.argv.length !== 3 || process.argv[2] !== "--apply")
		throw new Error(
			"To restore collection media locally, run npm run r2:restore -- --apply.",
		);
	if (!process.env.DATABASE_URL)
		throw new Error(
			"Set DATABASE_URL to the existing local collection database.",
		);
	const { databaseUrl } = environment(process.env);
	await access(databaseUrl.slice(5));
	const address = r2Address(process.env);
	const reader = r2Client(
		address,
		process.env.R2_READ_ACCESS_KEY_ID,
		process.env.R2_READ_SECRET_ACCESS_KEY,
	);
	const db = createClient({ url: databaseUrl });
	try {
		const result = await restoreCollectionMedia(
			db,
			".data/restored-media",
			async (filename) => {
				try {
					let bytes: Buffer | undefined;
					await retryTransient(async () => {
						bytes = await downloadVerifiedObject(reader, address, filename);
					});
					if (!bytes) throw new Error("Missing restored image.");
					return bytes;
				} catch {
					throw new Error(`R2 restore failed: ${filename}`);
				}
			},
		);
		console.log(JSON.stringify(result));
	} finally {
		db.close();
		reader.destroy();
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : "R2 restore failed.");
	process.exitCode = 1;
}
