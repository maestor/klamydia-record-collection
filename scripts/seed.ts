import { copyFile, mkdir, readFile } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { environment } from "../src/env.js";

const { databaseUrl } = environment(process.env);
const fixture = JSON.parse(await readFile("fixtures/demo.json", "utf8")) as {
	slug: string;
	title: string;
	published_at: string;
	description: string;
	images: { url: string; alt: string }[];
};
await mkdir(".data/media", { recursive: true });
await copyFile(
	"fixtures/media/example.svg",
	".data/media/example-248e687c.svg",
);
const db = createClient({ url: databaseUrl });
try {
	await db.batch(
		[
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
		],
		"write",
	);
} finally {
	db.close();
}
