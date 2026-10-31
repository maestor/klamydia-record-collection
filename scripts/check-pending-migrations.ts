import { appendFile } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { getPendingMigrationNames } from "../src/db.js";
import { databaseEnvironment } from "../src/env.js";

const db = createClient(databaseEnvironment(process.env));
try {
	const pending = await getPendingMigrationNames(db);
	if (process.env.GITHUB_OUTPUT)
		await appendFile(
			process.env.GITHUB_OUTPUT,
			`has_pending=${pending.length > 0}\npending_count=${pending.length}\n`,
		);
	console.log(
		pending.length
			? `Pending migrations (${pending.length}):\n${pending.join("\n")}`
			: "No pending migrations.",
	);
} finally {
	db.close();
}
