import { access } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { createApp } from "./app.js";
import { environment } from "./env.js";
import { r2Reader } from "./r2-reader.js";

export async function createRuntime(env: NodeJS.ProcessEnv) {
	const { databaseUrl, databaseAuthToken, port, siteUrl } = environment(env);
	const local = databaseUrl.startsWith("file:");
	if (local) await access(databaseUrl.slice(5));
	const media = r2Reader(env);
	const db = createClient({
		url: databaseUrl,
		authToken: databaseAuthToken,
		// Keep every local query on the connection protected by query_only.
		concurrency: local ? 1 : undefined,
	});
	// Turso enforces read-only access with the runtime's database token.
	if (local) await db.execute("PRAGMA query_only = ON");
	return { app: createApp(db, siteUrl, media), db, port };
}
