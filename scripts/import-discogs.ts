import { access } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { importDiscogs } from "../src/discogs-import.js";
import { databaseEnvironment } from "../src/env.js";

try {
	if (process.argv.length > 2) throw new Error("Usage: npm run import:discogs");
	if (!process.env.DATABASE_URL)
		throw new Error("Set DATABASE_URL to a migrated SQLite or Turso database");
	const config = databaseEnvironment(process.env);
	if (config.url.startsWith("file:")) await access(config.url.slice(5));
	const db = createClient(config);
	try {
		console.log(
			"Reading maestor’s four Discogs collection folders and release details…",
		);
		const result = await importDiscogs(
			db,
			process.env.DISCOGS_ACCESS_TOKEN ?? "",
		);
		console.log(
			`Imported ${result.copies} copies of ${result.releases} releases across ${result.folders} folders.`,
		);
	} finally {
		db.close();
	}
} catch (error) {
	console.error(
		error instanceof Error ? error.message : "Discogs import failed",
	);
	process.exitCode = 1;
}
