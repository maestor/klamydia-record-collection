import { readFile } from "node:fs/promises";
import type { Client } from "@libsql/client";

export async function migrate(db: Client) {
	const sql = await readFile("migrations/001_initial.sql", "utf8");
	await db.executeMultiple(sql);
	await db.executeMultiple(
		await readFile("migrations/002_instagram.sql", "utf8"),
	);
	await db.executeMultiple(
		await readFile("migrations/003_instagram_details.sql", "utf8"),
	);
	await db.executeMultiple(
		await readFile("migrations/004_image_editorial.sql", "utf8"),
	);
}
