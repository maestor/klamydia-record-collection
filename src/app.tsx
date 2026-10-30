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
			<link rel="stylesheet" href="/assets/style-84cf826c.css" />
			<script src="/assets/images-cc5a7637.js" defer></script>
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
const validMedia = (url: unknown): url is string =>
	typeof url === "string" && /^\/media\/[a-f0-9]{64}\.jpg$/.test(url);

const PostList: FC<{ posts: PostSummary[]; page?: number }> = ({
	posts,
	page,
}) =>
	posts.length ? (
		<ul class="post-list">
			{posts.map((post, index) => {
				const scale =
					post.cover_width && post.cover_height
						? Math.min(1, 640 / Math.max(post.cover_width, post.cover_height))
						: null;
				return (
					<li>
						<article class="post-card">
							<a
								class="post-card-link"
								href={`/posts/${encodeURIComponent(post.slug)}${page && page > 1 ? `?page=${page}` : ""}`}
							>
								<div class="artwork">
									<span class="artwork-placeholder" aria-hidden="true">
										{m.coverMissing}
									</span>
									{validMedia(post.cover_url) && (
										<img
											data-image-fallback
											src={post.cover_url}
											alt=""
											width={
												scale && post.cover_width
													? Math.round(post.cover_width * scale)
													: undefined
											}
											height={
												scale && post.cover_height
													? Math.round(post.cover_height * scale)
													: undefined
											}
											loading={index === 0 ? "eager" : "lazy"}
										/>
									)}
								</div>
								<div class="post-card-details">
									<h2>{post.title}</h2>
								</div>
							</a>
							<div class="post-card-meta">
								<time dateTime={post.published_at}>
									{formatDate(post.published_at)}
								</time>
								{post.image_count > 1 && (
									<span>{m.imageCount(post.image_count)}</span>
								)}
							</div>
						</article>
					</li>
				);
			})}
		</ul>
	) : (
		<p class="empty-state">{m.empty}</p>
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
			`default-src 'none'; img-src 'self' ${media.endpoint}; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
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
				<section class="intro">
					<p class="eyebrow">{m.introLabel}</p>
					<h1>
						Klamydia
						<wbr />
						kokoelma
					</h1>
					<p>{m.intro}</p>
				</section>
				<h2 class="section-title">{m.latest}</h2>
				<PostList posts={posts} />
				<p class="archive-action">
					<a class="button" href="/archive">
						{m.allPosts} <span aria-hidden="true">→</span>
					</a>
				</p>
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
				<p class="eyebrow">{m.archiveLabel}</p>
				<h1 class="page-title">{m.archive}</h1>
				<PostList posts={posts.slice(0, 12)} page={page} />
				<nav class="pagination" aria-label={m.archivePages}>
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
				<article class="post-detail">
					<p class="eyebrow">{m.postLabel}</p>
					<h1>{String(post.title)}</h1>
					<time dateTime={String(post.published_at)}>
						{formatDate(String(post.published_at))}
					</time>
					<h2 class="section-title">{m.images}</h2>
					<div class="gallery">
						{images
							.filter((image) =>
								/^\/media\/[a-f0-9]{64}\.jpg$/.test(String(image.url)),
							)
							.map((image) => {
								const url = String(image.url);
								const preview = validMedia(image.preview_url)
									? image.preview_url
									: url;
								const width = Number(image.width) || 0;
								const height = Number(image.height) || 0;
								const scale =
									width && height
										? Math.min(1, 640 / Math.max(width, height))
										: 0;
								const previewWidth = scale ? Math.round(width * scale) : 0;
								const previewHeight = scale ? Math.round(height * scale) : 0;
								return (
									<a class="gallery-image" href={url}>
										<img
											data-image-fallback
											data-fallback-label={m.coverMissing}
											src={preview}
											alt={String(image.alt)}
											width={previewWidth || undefined}
											height={previewHeight || undefined}
											srcSet={
												preview !== url && previewWidth && previewWidth < width
													? `${preview} ${previewWidth}w, ${url} ${width}w`
													: undefined
											}
											sizes="(max-width: 700px) 100vw, 32rem"
											loading="lazy"
										/>
									</a>
								);
							})}
					</div>
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
