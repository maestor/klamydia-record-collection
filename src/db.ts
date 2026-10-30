import { readFile } from "node:fs/promises";
import type { Client } from "@libsql/client";

export async function migrate(db: Client) {
	const sql = await readFile("migrations/001_initial.sql", "utf8");
	await db.executeMultiple(sql);
}
