import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { cleanupAssets } from "../scripts/cleanup-assets.js";

it("removes obsolete hashed assets while preserving current and indirectly referenced files", async () => {
	const root = await mkdtemp(join(tmpdir(), "asset-cleanup-"));
	try {
		await mkdir(join(root, "src/views"), { recursive: true });
		await mkdir(join(root, "public/assets"), { recursive: true });
		await writeFile(
			join(root, "src/views/layout.tsx"),
			'<link href="/assets/style-12345678.css"><script src="/assets/theme-abcdef12.js"></script>',
		);
		for (const [name, content] of Object.entries({
			"style-12345678.css": 'background: url("/assets/icon-87654321.png")',
			"icon-87654321.png": "image",
			"theme-abcdef12.js": "script",
			"style-00000000.css": "old",
			"gallery-11111111.js": "old",
			"custom.txt": "keep",
		}))
			await writeFile(join(root, "public/assets", name), content);
		expect(await cleanupAssets(root)).toEqual([
			"gallery-11111111.js",
			"style-00000000.css",
		]);
		expect((await readdir(join(root, "public/assets"))).sort()).toEqual([
			"custom.txt",
			"icon-87654321.png",
			"style-12345678.css",
			"theme-abcdef12.js",
		]);
		expect(
			await readFile(join(root, "public/assets/style-12345678.css"), "utf8"),
		).toContain("icon-87654321.png");
		expect(await cleanupAssets(root)).toEqual([]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it("does not delete anything when a current asset is missing", async () => {
	const root = await mkdtemp(join(tmpdir(), "asset-cleanup-missing-"));
	try {
		await mkdir(join(root, "src/views"), { recursive: true });
		await mkdir(join(root, "public/assets"), { recursive: true });
		await writeFile(
			join(root, "src/views/layout.tsx"),
			'<link href="/assets/style-12345678.css">',
		);
		await writeFile(join(root, "public/assets/style-00000000.css"), "old");
		await expect(cleanupAssets(root)).rejects.toThrow("style-12345678.css");
		expect(await readdir(join(root, "public/assets"))).toEqual([
			"style-00000000.css",
		]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
