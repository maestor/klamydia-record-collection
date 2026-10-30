import type { Client } from "@libsql/client";
import { Hono } from "hono";

export function createApp(db: Client) {
	const app = new Hono();
	app.use("*", async (c, next) => {
		await next();
		c.header(
			"Content-Security-Policy",
			"default-src 'none'; img-src 'self'; style-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
		);
		c.header("X-Content-Type-Options", "nosniff");
		c.header("Referrer-Policy", "strict-origin-when-cross-origin");
		c.header(
			"Cache-Control",
			c.res.status !== 200
				? "no-store"
				: c.req.path.startsWith("/assets/") || c.req.path.startsWith("/media/")
					? "public, max-age=31536000, immutable"
					: "public, max-age=0, s-maxage=300, stale-while-revalidate=60",
		);
	});
	app.get("/posts/:slug", async (c) => {
		const result = await db.execute({
			sql: "SELECT slug, title, published_at, description FROM posts WHERE slug = ?",
			args: [c.req.param("slug")],
		});
		const post = result.rows[0];
		if (!post) return c.text("Julkaisua ei löytynyt.", 404);
		const images = await db.execute({
			sql: "SELECT url, alt FROM images WHERE post_slug = ? ORDER BY position",
			args: [c.req.param("slug")],
		});
		return c.html(
			<html lang="fi">
				<head>
					<meta charSet="utf-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1" />
					<title>{String(post.title)} | Klamydiakokoelma</title>
					<link rel="stylesheet" href="/assets/style-df1d1612.css" />
				</head>
				<body>
					<header>
						<span>Klamydiakokoelma</span>
						<p>Esimerkkisisältöä – ei oikeita julkaisutietoja</p>
					</header>
					<main>
						<article>
							<h1>{String(post.title)}</h1>
							<time dateTime={String(post.published_at)}>
								{String(post.published_at)}
							</time>
							<p class="description">{String(post.description)}</p>
							<h2>Kuvat</h2>
							<div class="gallery">
								{images.rows
									.filter((image) =>
										/^\/media\/[a-zA-Z0-9._-]+$/.test(String(image.url)),
									)
									.map((image) => (
										<a href={String(image.url)}>
											<img
												src={String(image.url)}
												alt={String(image.alt)}
												width="640"
												height="640"
											/>
										</a>
									))}
							</div>
						</article>
					</main>
				</body>
			</html>,
		);
	});
	return app;
}
