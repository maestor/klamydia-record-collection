import type { Client } from "@libsql/client";
import { Hono } from "hono";
import { listPostSlugs } from "#repositories/posts";
import { renderSitemap } from "#views/sitemap";

export function createSitemapRoutes(db: Client, siteUrl: string) {
	const app = new Hono();
	app.get("/sitemap.xml", async (c) => {
		const slugs = await listPostSlugs(db);
		const urls = [
			`${siteUrl}/`,
			`${siteUrl}/archive`,
			`${siteUrl}/about`,
			...slugs.map((slug) => `${siteUrl}/posts/${encodeURIComponent(slug)}`),
		];
		return c.body(renderSitemap(urls), 200, {
			"Content-Type": "application/xml; charset=UTF-8",
		});
	});
	return app;
}
