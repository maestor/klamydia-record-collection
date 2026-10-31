import { execFileSync } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const staticAssets = ["style.css", "archive.js", "images.js", "sitemap.css"];

export async function buildAssets(root: string): Promise<void> {
	const output = join(root, "public/assets");
	await mkdir(output, { recursive: true });
	for (const name of staticAssets)
		await copyFile(join(root, "assets", name), join(output, name));
	execFileSync(
		process.execPath,
		[
			join(import.meta.dirname, "../node_modules/typescript/bin/tsc"),
			"--ignoreConfig",
			"--target",
			"ES2022",
			"--module",
			"ES2022",
			"--moduleResolution",
			"bundler",
			"--lib",
			"ES2022,DOM",
			"--skipLibCheck",
			"--outDir",
			output,
			join(root, "src/client/theme.ts"),
			join(root, "src/client/gallery.ts"),
		],
		{ stdio: "inherit", cwd: root },
	);
}
