import type { Client } from "@libsql/client";

export async function collectionMediaNames(db: Client) {
	const rows = (
		await db.execute(
			"SELECT images.url, instagram_images.preview_url FROM images JOIN instagram_posts USING(post_slug) LEFT JOIN instagram_images USING(post_slug,position)",
		)
	).rows;
	const names = new Set<string>();
	for (const row of rows)
		for (const value of [row.url, row.preview_url]) {
			if (
				typeof value !== "string" ||
				!/^\/media\/[a-f0-9]{64}\.jpg$/.test(value)
			)
				throw new Error("Collection has an invalid media path.");
			names.add(value.slice("/media/".length));
		}
	if (!names.size)
		throw new Error("The collection contains no imported media.");
	return [...names];
}
