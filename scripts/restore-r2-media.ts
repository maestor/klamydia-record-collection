import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Client } from "@libsql/client";
import { collectionMediaNames } from "./copy-r2-media.js";

export async function restoreCollectionMedia(
	db: Client,
	dir: string,
	get: (filename: string) => Promise<Buffer>,
) {
	const names = await collectionMediaNames(db);
	await mkdir(dir, { recursive: true });
	for (let offset = 0; offset < names.length; offset += 5) {
		const results = await Promise.allSettled(
			names.slice(offset, offset + 5).map(async (filename) => {
				const bytes = await get(filename);
				if (
					createHash("sha256").update(bytes).digest("hex") !==
					filename.slice(0, -4)
				)
					throw new Error(`Restored image hash mismatch: ${filename}`);
				const tmp = join(dir, `.staging-${randomUUID()}`);
				await writeFile(tmp, bytes, { flag: "wx" });
				try {
					try {
						await link(tmp, join(dir, filename));
					} catch (error) {
						if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
						if (!(await readFile(join(dir, filename))).equals(bytes))
							throw new Error(`Existing local image differs: ${filename}`);
					}
				} finally {
					await unlink(tmp);
				}
			}),
		);
		const failure = results.find((result) => result.status === "rejected");
		if (failure?.status === "rejected") throw failure.reason;
	}
	return { files: names.length };
}
