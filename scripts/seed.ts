import { copyFile, mkdir, readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";
import { environment } from "../src/env.js";

const { databaseUrl } = environment(process.env);
if (!process.env.DATABASE_URL)
	throw new Error(
		"Set DATABASE_URL explicitly to a separate demo database before seeding.",
	);
const target = resolve(databaseUrl.slice(5));
const collection = resolve(".data/collection.db");
const targetReal = await realpath(target).catch(() => target);
const collectionReal = await realpath(collection).catch(() => collection);
if (targetReal === collectionReal)
	throw new Error(
		"Use a separate demo database; the collection database cannot be seeded.",
	);
const fixtures = JSON.parse(await readFile("fixtures/demo.json", "utf8")) as {
	slug: string;
	title: string;
	published_at: string;
	description: string;
	images: { url: string; alt: string }[];
}[];
await mkdir(".data/media", { recursive: true });
await copyFile(
	"fixtures/media/example.svg",
	".data/media/example-248e687c.svg",
);
await copyFile(
	"fixtures/media/example-2.svg",
	".data/media/example-2-9784e620.svg",
);
const db = createClient({ url: databaseUrl });
try {
	await db.batch(
		fixtures.flatMap((fixture) => [
			{
				sql: "INSERT INTO posts (slug, title, published_at, description) VALUES (?, ?, ?, ?) ON CONFLICT(slug) DO UPDATE SET title=excluded.title, published_at=excluded.published_at, description=excluded.description",
				args: [
					fixture.slug,
					fixture.title,
					fixture.published_at,
					fixture.description,
				],
			},
			{ sql: "DELETE FROM images WHERE post_slug = ?", args: [fixture.slug] },
			...fixture.images.map((image, i) => ({
				sql: "INSERT INTO images (post_slug, position, url, alt) VALUES (?, ?, ?, ?)",
				args: [fixture.slug, i + 1, image.url, image.alt],
			})),
		]),
		"write",
	);
} finally {
	db.close();
}
