import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const buildDir = await mkdtemp(join(tmpdir(), "gallery-build-"));
try {
	execFileSync(
		"node_modules/.bin/tsc",
		[
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
			buildDir,
			"src/client/gallery.ts",
		],
		{ stdio: "inherit" },
	);
	const output = await readFile(join(buildDir, "gallery.js"));
	const hash = createHash("sha256").update(output).digest("hex").slice(0, 8);
	const path = `public/assets/gallery-${hash}.js`;
	await writeFile(path, output);
	console.log(path);
} finally {
	await rm(buildDir, { recursive: true, force: true });
}
