import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
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

export async function copyCollectionMedia(
	db: Client,
	mediaDir: string,
	put: (filename: string, bytes: Buffer) => Promise<void>,
	verify: (filename: string, bytes: Buffer) => Promise<void>,
) {
	const names = await collectionMediaNames(db);
	let bytes = 0;
	for (const filename of names) {
		const data = await readFile(join(mediaDir, filename));
		if (
			createHash("sha256").update(data).digest("hex") !== filename.slice(0, -4)
		)
			throw new Error(`Local media failed its content hash: ${filename}`);
		bytes += data.length;
	}
	const files = names;
	for (let offset = 0; offset < files.length; offset += 5) {
		const results = await Promise.allSettled(
			files.slice(offset, offset + 5).map(async (filename) => {
				const data = await readFile(join(mediaDir, filename));
				if (
					createHash("sha256").update(data).digest("hex") !==
					filename.slice(0, -4)
				)
					throw new Error(`Local media changed during copying: ${filename}`);
				await put(filename, data);
				await verify(filename, data);
			}),
		);
		const failure = results.find((result) => result.status === "rejected");
		if (failure?.status === "rejected") throw failure.reason;
	}
	return { files: names.length, bytes };
}
