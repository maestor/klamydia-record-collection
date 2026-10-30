import type { Client, Row } from "@libsql/client";
import { Hono } from "hono";
import type { FC, PropsWithChildren } from "hono/jsx";

const Layout: FC<
	PropsWithChildren<{
		title: string;
		canonical?: string;
		description?: string;
		demo: boolean;
	}>
> = ({ title, canonical, description, demo, children }) => (
	<html lang="fi">
		<head>
			<meta charSet="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<meta
				name="description"
				content={description || "Klamydiakokoelman julkaisuja."}
			/>
			<title>{title} | Klamydiakokoelma</title>
			{canonical && <link rel="canonical" href={canonical} />}
			<link rel="stylesheet" href="/assets/style-2e48a2f1.css" />
		</head>
		<body>
			<header>
				<a href="/">Klamydiakokoelma</a>
				<nav aria-label="Päävalikko">
					<a href="/archive">Arkisto</a>
				</nav>
				{demo && (
					<p>
						Arkisto sisältää esimerkkisisältöä, joka ei kuvaa oikeita
						julkaisuja.
					</p>
				)}
			</header>
			<main>{children}</main>
		</body>
	</html>
);
const PostList: FC<{ posts: Row[]; page?: number }> = ({ posts, page }) =>
	posts.length ? (
		<ul class="post-list">
			{posts.map((post) => (
				<li>
					<article>
						<h2>
							<a
								href={`/posts/${encodeURIComponent(String(post.slug))}${page && page > 1 ? `?page=${page}` : ""}`}
							>
								{String(post.title)}
							</a>
						</h2>
						<time dateTime={String(post.published_at)}>
							{String(post.published_at)}
						</time>
					</article>
				</li>
			))}
		</ul>
	) : (
		<p>Julkaisuja ei vielä ole.</p>
	);
export function createApp(
	db: Client,
	siteUrl = "http://localhost:3000",
	media?: { endpoint: string; sign: (filename: string) => Promise<string> },
) {
	const app = new Hono<{ Variables: { demo: boolean } }>();
	app.use("*", async (c, next) => {
		if (
			!c.req.path.startsWith("/assets/") &&
			!c.req.path.startsWith("/media/") &&
			c.req.path !== "/sitemap.xml"
		) {
			const result = await db.execute(
				"SELECT EXISTS(SELECT 1 FROM posts LEFT JOIN instagram_posts ON instagram_posts.post_slug = posts.slug WHERE instagram_posts.media_id IS NULL) AS present",
			);
			c.set("demo", Boolean(result.rows[0].present));
		}
		await next();
	});
	app.use("*", async (c, next) => {
		await next();
		c.header(
			"Content-Security-Policy",
			`default-src 'none'; img-src 'self'${media ? ` ${media.endpoint}` : ""}; style-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
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
	if (media)
		app.get("/media/:filename", async (c) => {
			const filename = c.req.param("filename");
			if (!/^[a-f0-9]{64}\.jpg$/.test(filename)) return c.notFound();
			const path = `/media/${filename}`;
			const found = await db.execute({
				sql: "SELECT 1 FROM images WHERE url = ? UNION ALL SELECT 1 FROM instagram_images WHERE preview_url = ? LIMIT 1",
				args: [path, path],
			});
			if (!found.rows.length) return c.notFound();
			try {
				return c.redirect(await media.sign(filename), 302);
			} catch {
				return c.text("Image temporarily unavailable", 503);
			}
		});
	app.get("/", async (c) => {
		const posts = await db.execute(
			"SELECT slug, title, published_at FROM posts ORDER BY published_at DESC, slug DESC LIMIT 6",
		);
		return c.html(
			<Layout title="Etusivu" canonical={`${siteUrl}/`} demo={c.get("demo")}>
				<h1>Klamydiakokoelma</h1>
				<p>Tutustu kokoelman julkaisuihin.</p>
				<h2>Uusimmat julkaisut</h2>
				<PostList posts={posts.rows} />
			</Layout>,
		);
	});
	app.get("/archive", async (c) => {
		const raw = c.req.query("page");
		if (raw !== undefined && !/^[1-9]\d{0,5}$/.test(raw))
			return c.html(
				<Layout title="Virheellinen sivu" demo={c.get("demo")}>
					<h1>Virheellinen sivunumero</h1>
					<a href="/archive">Siirry arkistoon</a>
				</Layout>,
				400,
			);
		const page = raw ? Number(raw) : 1;
		const posts = await db.execute({
			sql: "SELECT slug, title, published_at FROM posts ORDER BY published_at DESC, slug DESC LIMIT 13 OFFSET ?",
			args: [(page - 1) * 12],
		});
		return c.html(
			<Layout
				title="Arkisto"
				demo={c.get("demo")}
				canonical={`${siteUrl}/archive${page > 1 ? `?page=${page}` : ""}`}
			>
				<h1>Arkisto</h1>
				<PostList posts={posts.rows.slice(0, 12)} page={page} />
				<nav aria-label="Arkiston sivut">
					{page > 1 && (
						<a href={page === 2 ? "/archive" : `/archive?page=${page - 1}`}>
							Uudemmat
						</a>
					)}
					<span>Sivu {page}</span>
					{posts.rows.length > 12 && (
						<a href={`/archive?page=${page + 1}`}>Vanhemmat</a>
					)}
				</nav>
			</Layout>,
		);
	});
	app.get("/sitemap.xml", async (c) => {
		const posts = await db.execute(
			"SELECT slug FROM posts ORDER BY published_at DESC, slug DESC",
		);
		const urls = [
			`${siteUrl}/`,
			`${siteUrl}/archive`,
			...posts.rows.map(
				(post) => `${siteUrl}/posts/${encodeURIComponent(String(post.slug))}`,
			),
		];
		return c.body(
			`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${url.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</loc></url>`).join("")}</urlset>`,
			200,
			{ "Content-Type": "application/xml; charset=UTF-8" },
		);
	});
	app.get("/posts/:slug", async (c) => {
		const result = await db.execute({
			sql: "SELECT slug, title, published_at, description FROM posts WHERE slug = ?",
			args: [c.req.param("slug")],
		});
		const post = result.rows[0];
		if (!post)
			return c.html(
				<Layout title="Ei löytynyt" demo={c.get("demo")}>
					<h1>Julkaisua ei löytynyt</h1>
					<a href="/archive">Siirry arkistoon</a>
				</Layout>,
				404,
			);
		const images = await db.execute({
			sql: "SELECT images.url, images.alt, instagram_images.preview_url FROM images LEFT JOIN instagram_images ON instagram_images.post_slug = images.post_slug AND instagram_images.position = images.position WHERE images.post_slug = ? ORDER BY images.position",
			args: [c.req.param("slug")],
		});
		return c.html(
			<Layout
				title={String(post.title)}
				demo={c.get("demo")}
				canonical={`${siteUrl}/posts/${encodeURIComponent(String(post.slug))}`}
				description={String(post.description).slice(0, 160)}
			>
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
										src={
											/^\/media\/[a-zA-Z0-9._-]+$/.test(
												String(image.preview_url),
											)
												? String(image.preview_url)
												: String(image.url)
										}
										alt={String(image.alt)}
										width="640"
										height="640"
										loading="lazy"
									/>
								</a>
							))}
					</div>
					<p>
						<a
							href={
								/^[1-9]\d{0,5}$/.test(c.req.query("page") ?? "") &&
								c.req.query("page") !== "1"
									? `/archive?page=${c.req.query("page")}`
									: "/archive"
							}
						>
							Takaisin arkistoon
						</a>
					</p>
				</article>
			</Layout>,
		);
	});
	return app;
}
