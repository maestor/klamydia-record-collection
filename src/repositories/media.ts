import type { Client } from "@libsql/client";

export async function hasPublishedImage(db: Client, path: string) {
	const found = await db.execute({
		sql: "SELECT 1 FROM images WHERE url = ? UNION ALL SELECT 1 FROM instagram_images WHERE preview_url = ? LIMIT 1",
		args: [path, path],
	});
	return found.rows.length > 0;
}
