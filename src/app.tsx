import type { Client } from "@libsql/client";
import { Hono } from "hono";
import type { FC, PropsWithChildren } from "hono/jsx";
import { formatDate, locale, messages as m } from "./i18n/fi.js";
import { presentDescription } from "./presentation/description.js";
import {
	getImages,
	getPost,
	getTags,
	listPosts,
	type PostSummary,
} from "./repositories/posts.js";

const Layout: FC<
	PropsWithChildren<{
		title: string;
		canonical?: string;
		description?: string;
	}>
> = ({ title, canonical, description, children }) => (
	<html lang={locale.language}>
		<head>
			<meta charSet="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<meta name="description" content={description || m.defaultDescription} />
			<title>{title} | Klamydiakokoelma</title>
			{canonical && <link rel="canonical" href={canonical} />}
			<link rel="stylesheet" href="/assets/style-a5137ec5.css" />
		</head>
		<body>
			<header>
				<a href="/">Klamydiakokoelma</a>
				<nav aria-label={m.navigation}>
					<a href="/archive">{m.archive}</a>
				</nav>
			</header>
			<main>{children}</main>
		</body>
	</html>
);
const PostList: FC<{ posts: PostSummary[]; page?: number }> = ({
	posts,
	page,
}) =>
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
							{formatDate(String(post.published_at))}
						</time>
					</article>
				</li>
			))}
		</ul>
	) : (
		<p>{m.empty}</p>
	);
export function createApp(
	db: Client,
	siteUrl: string,
	media: { endpoint: string; sign: (filename: string) => Promise<string> },
) {
	const app = new Hono();
	app.use("*", async (c, next) => {
		await next();
		c.header(
			"Content-Security-Policy",
			`default-src 'none'; img-src 'self' ${media.endpoint}; style-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
		);
		c.header("X-Content-Type-Options", "nosniff");
		c.header("Referrer-Policy", "strict-origin-when-cross-origin");
		c.header(
			"Cache-Control",
			c.res.status !== 200
				? "no-store"
				: c.req.path.startsWith("/assets/")
					? "public, max-age=31536000, immutable"
					: "public, max-age=0, s-maxage=300, stale-while-revalidate=60",
		);
	});
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
		const posts = await listPosts(db, 6);
		return c.html(
			<Layout title={m.home} canonical={`${siteUrl}/`}>
				<h1>Klamydiakokoelma</h1>
				<p>{m.intro}</p>
				<h2>{m.latest}</h2>
				<PostList posts={posts} />
			</Layout>,
		);
	});
	app.get("/archive", async (c) => {
		const raw = c.req.query("page");
		if (raw !== undefined && !/^[1-9]\d{0,5}$/.test(raw))
			return c.html(
				<Layout title={m.invalidTitle}>
					<h1>{m.invalidPage}</h1>
					<a href="/archive">{m.goArchive}</a>
				</Layout>,
				400,
			);
		const page = raw ? Number(raw) : 1;
		const posts = await listPosts(db, 13, (page - 1) * 12);
		return c.html(
			<Layout
				title={m.archive}
				canonical={`${siteUrl}/archive${page > 1 ? `?page=${page}` : ""}`}
			>
				<h1>{m.archive}</h1>
				<PostList posts={posts.slice(0, 12)} page={page} />
				<nav aria-label={m.archivePages}>
					{page > 1 && (
						<a href={page === 2 ? "/archive" : `/archive?page=${page - 1}`}>
							{m.newer}
						</a>
					)}
					<span>{m.page(page)}</span>
					{posts.length > 12 && (
						<a href={`/archive?page=${page + 1}`}>{m.older}</a>
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
		const post = await getPost(db, c.req.param("slug"));
		if (!post)
			return c.html(
				<Layout title={m.notFound}>
					<h1>{m.postNotFound}</h1>
					<a href="/archive">{m.goArchive}</a>
				</Layout>,
				404,
			);
		const [images, tags] = await Promise.all([
			getImages(db, c.req.param("slug")),
			getTags(db, c.req.param("slug")),
		]);
		const reading = presentDescription(
			String(post.title),
			String(post.description),
		);
		const permalink = String(post.permalink ?? "");
		return c.html(
			<Layout
				title={String(post.title)}
				canonical={`${siteUrl}/posts/${encodeURIComponent(String(post.slug))}`}
				description={reading.text.slice(0, 160)}
			>
				<article>
					<h1>{String(post.title)}</h1>
					<time dateTime={String(post.published_at)}>
						{formatDate(String(post.published_at))}
					</time>
					<p class="description">{reading.text}</p>
					{tags.length > 0 && (
						<ul class="tags" aria-label={m.tags}>
							{tags.map((tag) => (
								<li>{String(tag.display)}</li>
							))}
						</ul>
					)}
					{/^https:\/\/www\.instagram\.com\/p\/[A-Za-z0-9_-]+\/?$/.test(
						permalink,
					) && (
						<p>
							<a class="source-link" href={permalink}>
								<svg
									aria-hidden="true"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<rect x="3" y="3" width="18" height="18" rx="5" />
									<circle cx="12" cy="12" r="4" />
									<circle
										cx="17.5"
										cy="6.5"
										r=".7"
										fill="currentColor"
										stroke="none"
									/>
								</svg>
								{m.source}
							</a>
						</p>
					)}
					<h2>{m.images}</h2>
					<div class="gallery">
						{images
							.filter((image) =>
								/^\/media\/[a-f0-9]{64}\.jpg$/.test(String(image.url)),
							)
							.map((image) => (
								<a href={String(image.url)}>
									<img
										src={
											/^\/media\/[a-f0-9]{64}\.jpg$/.test(
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
							{m.backArchive}
						</a>
					</p>
				</article>
			</Layout>,
		);
	});
	return app;
}
