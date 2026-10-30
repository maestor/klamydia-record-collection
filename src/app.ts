import type { Client } from "@libsql/client";
import { Hono } from "hono";
import { responsePolicy } from "#middleware/response-policy";
import { createCollectionRoutes } from "#routes/collection";
import { createMediaRoutes, type MediaReader } from "#routes/media";
import { createPostRoutes } from "#routes/posts";
import { createSitemapRoutes } from "#routes/sitemap";

export function createApp(db: Client, siteUrl: string, media: MediaReader) {
	const app = new Hono();
	app.use("*", responsePolicy(media.endpoint));
	app.route("/", createMediaRoutes(db, media));
	app.route("/", createCollectionRoutes(db, siteUrl));
	app.route("/", createPostRoutes(db, siteUrl));
	app.route("/", createSitemapRoutes(db, siteUrl));
	return app;
}
