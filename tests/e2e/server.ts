import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createClient } from "@libsql/client";
import { createApp } from "../../src/app.js";
import { migrate } from "../../src/db.js";

const db = createClient({ url: "file::memory:" });
await migrate(db);
const fixtures = JSON.parse(
	await readFile("tests/fixtures/posts.json", "utf8"),
) as {
	slug: string;
	title: string;
	published_at: string;
	description: string;
	images: { url: string; alt: string }[];
}[];
const images = new Map<string, string>();
for (const post of fixtures) {
	await db.execute({
		sql: "INSERT INTO posts VALUES (?,?,?,?)",
		args: [post.slug, post.title, post.published_at, post.description],
	});
	for (const [index, image] of post.images.entries()) {
		const filename = `${createHash("sha256").update(image.url).digest("hex")}.jpg`;
		images.set(
			filename,
			image.url.includes("example-2")
				? "tests/fixtures/media/example-2.svg"
				: "tests/fixtures/media/example.svg",
		);
		await db.execute({
			sql: "INSERT INTO images VALUES (?,?,?,?)",
			args: [post.slug, index + 1, `/media/${filename}`, image.alt],
		});
	}
}
await db.execute({
	sql: "INSERT INTO posts VALUES (?, ?, ?, ?)",
	args: [
		"about-fixture",
		"Johdanto",
		"2023-01-02",
		"Tämä on kuvitteellinen esittely.\n\n#kokoelma",
	],
});
await db.execute({
	sql: "INSERT INTO instagram_posts VALUES (?, ?, ?, ?, ?, ?)",
	args: [
		"17970239393043334",
		"about-fixture",
		"https://www.instagram.com/p/example/",
		"fixture",
		"IMAGE",
		"2023-01-02",
	],
});
const aboutFilename = `${createHash("sha256").update("about-fixture").digest("hex")}.jpg`;
images.set(aboutFilename, "tests/fixtures/media/example.svg");
await db.execute({
	sql: "INSERT INTO images VALUES (?, ?, ?, ?)",
	args: ["about-fixture", 1, `/media/${aboutFilename}`, "Kuva"],
});
const base = "http://127.0.0.1:3107";
const app = createApp(db, base, {
	endpoint: base,
	sign: async (filename) => `${base}/test-images/${filename}`,
});
app.get("/test-images/:filename", async (c) => {
	const path = images.get(c.req.param("filename"));
	return path
		? c.body(await readFile(path), 200, { "Content-Type": "image/svg+xml" })
		: c.notFound();
});
app.get("/assets/*", serveStatic({ root: "./public" }));
const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 3107 });
process.on("SIGTERM", () => {
	server.close(() => {
		db.close();
		process.exit(0);
	});
});
