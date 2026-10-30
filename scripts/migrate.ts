import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createClient } from "@libsql/client";
import { migrate } from "../src/db.js";
import { environment } from "../src/env.js";

const { databaseUrl } = environment(process.env);
await mkdir(dirname(databaseUrl.slice(5)), { recursive: true });
const db = createClient({ url: databaseUrl });
try {
	await migrate(db);
} finally {
	db.close();
}
