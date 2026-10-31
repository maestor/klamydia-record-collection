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
import { buildAssets } from "../scripts/build-assets.js";

it("builds replaceable browser assets without adding versioned files", async () => {
	const root = await mkdtemp(join(tmpdir(), "asset-build-"));
	try {
		await mkdir(join(root, "assets"));
		await mkdir(join(root, "src/client"), { recursive: true });
		for (const name of ["style.css", "sitemap.css", "archive.js", "images.js"])
			await writeFile(join(root, "assets", name), `/* ${name} */`);
		await writeFile(
			join(root, "src/client/theme.ts"),
			"document.title = 'first';",
		);
		await writeFile(
			join(root, "src/client/gallery.ts"),
			"document.title = 'gallery';",
		);

		await buildAssets(root);
		expect((await readdir(join(root, "public/assets"))).sort()).toEqual([
			"archive.js",
			"gallery.js",
			"images.js",
			"sitemap.css",
			"style.css",
			"theme.js",
		]);
		expect(
			await readFile(join(root, "public/assets/theme.js"), "utf8"),
		).toContain("first");

		await writeFile(
			join(root, "src/client/theme.ts"),
			"document.title = 'second';",
		);
		await writeFile(join(root, "assets/style.css"), "body { color: red; }");
		await buildAssets(root);
		expect((await readdir(join(root, "public/assets"))).sort()).toEqual([
			"archive.js",
			"gallery.js",
			"images.js",
			"sitemap.css",
			"style.css",
			"theme.js",
		]);
		expect(
			await readFile(join(root, "public/assets/theme.js"), "utf8"),
		).toContain("second");
		expect(await readFile(join(root, "public/assets/style.css"), "utf8")).toBe(
			"body { color: red; }",
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
