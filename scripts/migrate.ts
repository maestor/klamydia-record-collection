import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createClient } from "@libsql/client";
import { migrate } from "../src/db.js";
import { databaseEnvironment } from "../src/env.js";

const config = databaseEnvironment(process.env);
if (config.url.startsWith("file:"))
	await mkdir(dirname(config.url.slice(5)), { recursive: true });
const db = createClient(config);
try {
	await migrate(db);
} finally {
	db.close();
}
