import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parseEnv } from "node:util";
import { serve } from "@hono/node-server";
import { createClient } from "@libsql/client";
import { migrate } from "../src/db.js";
import { databaseEnvironment, localDatabaseUrl } from "../src/env.js";
import { createEditor, editorOrigin } from "./discogs-editor.js";

function settings(file: string) {
	return existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
}
const localEnv = settings(".env");
const localPort = Number(localEnv.PORT ?? 3000);
let local: Promise<ReturnType<typeof createClient>> | undefined;
async function openLocal() {
	const url = localDatabaseUrl(
		localEnv.DATABASE_URL ?? "file:.data/collection.db",
	);
	await mkdir(dirname(url.slice(5)), { recursive: true });
	const db = createClient({ url });
	try {
		await migrate(db);
		return db;
	} catch (error) {
		db.close();
		throw error;
	}
}
let production: ReturnType<typeof createClient> | undefined;
const app = createEditor(
	{
		local: () =>
			(local ??= openLocal().catch((error) => {
				local = undefined;
				throw error;
			})),
		production: () => {
			if (production) return production;
			const config = databaseEnvironment(settings(".env.turso-import"));
			if (!config.url.startsWith("libsql://"))
				throw new Error("Production requires Turso");
			production = createClient(config);
			return production;
		},
	},
	`http://localhost:${localPort}`,
);
const address = new URL(editorOrigin);
const server = serve(
	{
		fetch: app.fetch,
		hostname: address.hostname,
		port: Number(address.port),
	},
	() => {
		console.log(`Discogs editor: ${editorOrigin} (Ctrl+C to close)`);
		if (process.argv.includes("--open"))
			spawn("open", [editorOrigin], { stdio: "ignore" }).on("error", () =>
				console.log(`Open ${editorOrigin} in your browser.`),
			);
	},
);
server.on("close", () => {
	production?.close();
	void local?.then((db) => db.close());
});
