import type { Client } from "@libsql/client";
import { Hono } from "hono";
import { hasPublishedImage } from "#repositories/media";

export type MediaReader = {
	endpoint: string;
	sign: (filename: string) => Promise<string>;
};

export function createMediaRoutes(db: Client, media: MediaReader) {
	const app = new Hono();
	app.get("/media/:filename", async (c) => {
		const filename = c.req.param("filename");
		if (!/^[a-f0-9]{64}\.jpg$/.test(filename)) return c.notFound();
		if (!(await hasPublishedImage(db, `/media/${filename}`)))
			return c.notFound();
		try {
			return c.redirect(await media.sign(filename), 302);
		} catch {
			return c.text("Image temporarily unavailable", 503);
		}
	});
	return app;
}
