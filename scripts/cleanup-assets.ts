import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

const hashedAsset = /^(?:[a-z0-9]+-)+[a-f0-9]{8}\.[a-z0-9]+$/;
const assetUrl = /\/assets\/([a-zA-Z0-9][a-zA-Z0-9._-]*)/g;

export async function cleanupAssets(root: string): Promise<string[]> {
	const sourceDir = join(root, "src");
	const assetDir = join(root, "public/assets");
	const entries = await readdir(assetDir, { withFileTypes: true });
	const names = entries
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name);
	const available = new Set(names);
	const referenced = new Set<string>();
	const queue: string[] = [];
	function findReferences(contents: string) {
		for (const match of contents.matchAll(assetUrl)) {
			if (!available.has(match[1]))
				throw new Error(`Referenced asset missing: ${match[1]}`);
		}
		for (const name of names) {
			if (!referenced.has(name) && contents.includes(name)) {
				referenced.add(name);
				queue.push(name);
			}
		}
	}
	for (const entry of await readdir(sourceDir, {
		recursive: true,
		withFileTypes: true,
	})) {
		if (entry.isFile() && /\.(?:ts|tsx|js|jsx|css)$/.test(entry.name)) {
			findReferences(
				await readFile(join(entry.parentPath, entry.name), "utf8"),
			);
		}
	}
	if (referenced.size === 0)
		throw new Error("No asset references found in src; nothing removed.");
	for (const name of queue) {
		if (/\.(?:css|js|svg)$/.test(name))
			findReferences(await readFile(join(assetDir, name), "utf8"));
	}
	const obsolete = names
		.filter((name) => hashedAsset.test(name) && !referenced.has(name))
		.sort();
	for (const name of obsolete) await unlink(join(assetDir, name));
	return obsolete;
}
