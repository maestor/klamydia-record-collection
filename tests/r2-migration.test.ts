import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { expect, it } from "vitest";
import { copyCollectionMedia } from "../scripts/copy-r2-media.js";
import { restoreCollectionMedia } from "../scripts/restore-r2-media.js";
import { migrate } from "../src/db.js";

it("copies only collection-referenced content-addressed files and verifies every uploaded object", async () => {
	const db = createClient({ url: "file::memory:" });
	const dir = await mkdtemp(join(tmpdir(), "r2-copy-"));
	try {
		await migrate(db);
		const bytes = Buffer.from("example image bytes");
		const filename = `${createHash("sha256").update(bytes).digest("hex")}.jpg`;
		await writeFile(join(dir, filename), bytes);
		await writeFile(join(dir, "unrelated.jpg"), "untouched");
		await db.execute({
			sql: "INSERT INTO posts VALUES (?,?,?,?)",
			args: ["post", "Title", "2024-01-01", "Caption"],
		});
		await db.execute({
			sql: "INSERT INTO instagram_posts VALUES (?,?,?,?,?,?)",
			args: [
				"1",
				"post",
				"https://www.instagram.com/p/test/",
				"fingerprint",
				"IMAGE",
				"2024-01-01",
			],
		});
		await db.execute({
			sql: "INSERT INTO images VALUES (?,?,?,?)",
			args: ["post", 1, `/media/${filename}`, "Image"],
		});
		await db.execute({
			sql: "INSERT INTO instagram_images VALUES (?,?,?,?,?,?,?,?)",
			args: [
				"post",
				1,
				"1",
				1,
				1,
				"jpeg",
				filename.slice(0, -4),
				`/media/${filename}`,
			],
		});
		const objects = new Map<string, Buffer>();
		const result = await copyCollectionMedia(
			db,
			dir,
			async (name, body) => {
				objects.set(name, body);
			},
			async (name, body) => {
				expect(objects.get(name)?.equals(body)).toBe(true);
			},
		);
		expect(result).toEqual({ files: 1, bytes: bytes.length });
		expect([...objects.keys()]).toEqual([filename]);
		const restoreDir = join(dir, "restore");
		expect(
			await restoreCollectionMedia(
				db,
				restoreDir,
				async (name) => objects.get(name) as Buffer,
			),
		).toEqual({ files: 1 });
		expect(await readFile(join(restoreDir, filename))).toEqual(bytes);
		await writeFile(join(restoreDir, filename), "different local contents");
		await expect(
			restoreCollectionMedia(
				db,
				restoreDir,
				async (name) => objects.get(name) as Buffer,
			),
		).rejects.toThrow("Existing local image differs");
		await writeFile(join(dir, filename), "corrupted");
		objects.clear();
		await expect(
			copyCollectionMedia(
				db,
				dir,
				async (name, body) => {
					objects.set(name, body);
				},
				async () => {},
			),
		).rejects.toThrow("content hash");
		expect(objects.size).toBe(0);
	} finally {
		db.close();
		await rm(dir, { recursive: true, force: true });
	}
});
