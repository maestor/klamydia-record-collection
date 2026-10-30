import type { Client } from "@libsql/client";
import { Hono } from "hono";
import type { FC, PropsWithChildren } from "hono/jsx";
import { formatDate, locale, messages as m } from "./i18n/fi.js";
import { presentDescription } from "./presentation/description.js";
import {
	ABOUT_MEDIA_ID,
	getAboutPost,
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
		archive?: boolean;
		gallery?: boolean;
	}>
> = ({ title, canonical, description, archive, gallery, children }) => (
	<html lang={locale.language}>
		<head>
			<meta charSet="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<meta name="description" content={description || m.defaultDescription} />
			<title>{title} | Klamydiakokoelma</title>
			{canonical && <link rel="canonical" href={canonical} />}
			<link rel="stylesheet" href="/assets/style-b5bccb7b.css" />
			<script src="/assets/images-cc5a7637.js" defer></script>
			{gallery && <script src="/assets/gallery-d693c11e.js" defer></script>}
			{archive && (
				<>
					<script src="/assets/htmx-d6fdc75f.js" defer></script>
					<script src="/assets/archive-7e74fb84.js" defer></script>
				</>
			)}
		</head>
		<body>
			<header>
				<a href="/">Klamydiakokoelma</a>
				<nav aria-label={m.navigation}>
					<a href="/archive">{m.archive}</a>
					<a href="/about">{m.about}</a>
				</nav>
			</header>
			<main>{children}</main>
		</body>
	</html>
);
const InstagramIcon: FC = () => (
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
		<circle cx="17.5" cy="6.5" r=".7" fill="currentColor" stroke="none" />
	</svg>
);
const validMedia = (url: unknown): url is string =>
	typeof url === "string" && /^\/media\/[a-f0-9]{64}\.jpg$/.test(url);

function archiveContext(page?: number, through?: number) {
	if (!page || (page === 1 && (!through || through === 1))) return "";
	return `?page=${page}${through && through > page ? `&through=${through}` : ""}`;
}
const PostItems: FC<{
	posts: PostSummary[];
	page?: number;
	through?: number;
}> = ({ posts, page, through }) => (
	<>
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
							href={`/posts/${encodeURIComponent(post.slug)}${archiveContext(page, through)}`}
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
	</>
);
const PostList: FC<{
	posts: PostSummary[];
	page?: number;
	through?: number;
	archive?: boolean;
}> = ({ posts, page, through, archive }) =>
	posts.length ? (
		<ul class="post-list" id={archive ? "archive-list" : undefined}>
			<PostItems posts={posts} page={page} through={through} />
		</ul>
	) : (
		<p class="empty-state">{m.empty}</p>
	);
const ARCHIVE_BATCH_LIMIT = 20;
const validPage = (raw: string | undefined) =>
	raw !== undefined && /^[1-9]\d{0,5}$/.test(raw);
function range(page: string | undefined, through: string | undefined) {
	if (
		(page !== undefined && !validPage(page)) ||
		(through !== undefined && (!validPage(through) || page === undefined))
	)
		return null;
	const start = page ? Number(page) : 1;
	const end = through ? Number(through) : start;
	return end >= start && end - start < ARCHIVE_BATCH_LIMIT
		? { start, end }
		: null;
}
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
			`default-src 'none'; img-src 'self' ${media.endpoint}; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
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

	app.get("/about", async (c) => {
		const post = await getAboutPost(db);
		const images = post ? await getImages(db, String(post.slug)) : [];
		const image = images[0];
		const imageUrl = image && validMedia(image.url) ? image.url : null;
		const preview =
			imageUrl && image && validMedia(image.preview_url)
				? image.preview_url
				: imageUrl;
		const reading = post
			? presentDescription(String(post.title), String(post.description)).text
			: "";
		return c.html(
			<Layout
				title={m.aboutTitle}
				canonical={`${siteUrl}/about`}
				description={reading.slice(0, 160)}
			>
				<article class="about-page">
					<p class="eyebrow">Klamydiakokoelma</p>
					<h1 class="page-title">{m.aboutTitle}</h1>
					{post ? (
						<>
							<p class="about-date">
								<time dateTime="2023-01-02">{m.aboutWritten}</time>
							</p>
							<div class="about-content">
								<div class="about-image">
									{preview ? (
										<img
											data-image-fallback
											data-fallback-label={m.coverMissing}
											src={preview}
											alt={m.aboutImageAlt}
											width={Number(image?.width) || undefined}
											height={Number(image?.height) || undefined}
										/>
									) : (
										<p class="image-failure">{m.coverMissing}</p>
									)}
								</div>
								<div>
									<p class="description">{reading}</p>
									<p>
										<a
											class="source-link"
											href="https://www.instagram.com/klamydiakokoelma/"
										>
											<InstagramIcon />
											{m.followInstagram}
										</a>
									</p>
								</div>
							</div>
						</>
					) : (
						<p class="empty-state">{m.aboutUnavailable}</p>
					)}
				</article>
			</Layout>,
		);
	});
	app.get("/archive/fragments", async (c) => {
		const rawPage = c.req.query("page");
		const rawStart = c.req.query("start");
		if (!validPage(rawPage) || !validPage(rawStart))
			return c.text(m.invalidPage, 400);
		const start = Number(rawStart),
			page = Number(rawPage);
		if (page <= start || page - start >= ARCHIVE_BATCH_LIMIT)
			return c.text(m.invalidPage, 400);
		const rows = await listPosts(db, 13, (page - 1) * 12);
		c.header("X-Archive-Count", String(Math.min(rows.length, 12)));
		c.header("X-Archive-Has-More", String(rows.length > 12));
		return c.html(
			<PostItems posts={rows.slice(0, 12)} page={start} through={page} />,
		);
	});
	app.get("/archive", async (c) => {
		const selection = range(c.req.query("page"), c.req.query("through"));
		if (!selection)
			return c.html(
				<Layout title={m.invalidTitle}>
					<h1>{m.invalidPage}</h1>
					<a href="/archive">{m.goArchive}</a>
				</Layout>,
				400,
			);
		const { start, end } = selection;
		const limit = (end - start + 1) * 12;
		const posts = await listPosts(db, limit + 1, (start - 1) * 12);
		const hasMore = posts.length > limit && end < 999999;
		const canAppend = end - start < ARCHIVE_BATCH_LIMIT - 1;
		return c.html(
			<Layout
				archive
				title={m.archive}
				canonical={`${siteUrl}/archive${archiveContext(start, end)}`}
			>
				<p class="eyebrow">{m.archiveLabel}</p>
				<h1 class="page-title">{m.archive}</h1>
				<section
					id="archive-results"
					aria-label={m.archive}
					aria-busy="false"
					data-start={start}
					data-end={end}
					data-batch-limit={ARCHIVE_BATCH_LIMIT}
					data-loading={m.archiveLoading}
					data-error={m.archiveError}
					data-retry={m.archiveRetry}
					data-more={m.loadMore}
					data-next={m.nextPage}
					data-end-message={m.archiveEnd}
					data-progress={m.archiveProgressTemplate}
					data-added={m.archiveAddedTemplate}
					data-page-label={m.archivePageTemplate}
				>
					<PostList
						posts={posts.slice(0, limit)}
						page={start}
						through={end}
						archive
					/>
					<p id="archive-status" role="status" aria-live="polite">
						{posts.length
							? `${m.archiveProgress(start, end, Math.min(posts.length, limit))}${hasMore ? "" : ` ${m.archiveEnd}`}`
							: ""}
					</p>
					<nav class="pagination" aria-label={m.archivePages}>
						{start > 1 && (
							<a href={start === 2 ? "/archive" : `/archive?page=${start - 1}`}>
								{m.newer}
							</a>
						)}
						<span id="archive-page-label">{m.page(end)}</span>
						{hasMore ? (
							<a
								id="archive-more"
								class="button"
								href={`/archive?page=${end + 1}`}
								data-enhance={canAppend ? "true" : "false"}
							>
								{canAppend ? m.loadMore : m.nextPage}
							</a>
						) : (
							posts.length > 0 && <span id="archive-end">{m.archiveEnd}</span>
						)}
						{hasMore && (
							<a id="archive-fallback" href={`/archive?page=${end + 1}`} hidden>
								{m.archiveFallback}
							</a>
						)}
					</nav>
				</section>
			</Layout>,
		);
	});
	app.get("/sitemap.xml", async (c) => {
		const posts = await db.execute({
			sql: "SELECT p.slug FROM posts p WHERE NOT EXISTS (SELECT 1 FROM instagram_posts ip WHERE ip.post_slug = p.slug AND ip.media_id = ?) ORDER BY p.published_at DESC, p.slug DESC",
			args: [ABOUT_MEDIA_ID],
		});
		const urls = [
			`${siteUrl}/`,
			`${siteUrl}/archive`,
			`${siteUrl}/about`,
			...posts.rows.map(
				(post) => `${siteUrl}/posts/${encodeURIComponent(String(post.slug))}`,
			),
		];
		return c.body(
			`<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/css" href="/assets/sitemap-6cef9e89.css"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${url.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</loc></url>`).join("")}</urlset>`,
			200,
			{ "Content-Type": "application/xml; charset=UTF-8" },
		);
	});
	app.get("/posts/:slug", async (c) => {
		const about = await getAboutPost(db);
		if (about && String(about.slug) === c.req.param("slug"))
			return c.redirect("/about", 302);
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
		const galleryImages = images.filter((image) => validMedia(image.url));
		return c.html(
			<Layout
				gallery={galleryImages.length > 0}
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
					<h2 class="section-title" id="gallery-heading">
						{m.images}
					</h2>
					<section
						class="gallery"
						aria-labelledby="gallery-heading"
						data-previous={m.galleryPrevious}
						data-next={m.galleryNext}
						data-status={m.galleryStatus}
						data-thumbnail={m.galleryThumbnail}
						data-pagination={m.galleryPagination}
						data-thumbnails={m.galleryThumbnails}
						data-toggle-thumbnails={m.galleryToggleThumbnails}
						data-dialog={m.galleryDialog}
						data-enlarge={m.galleryEnlarge}
						data-close={m.galleryClose}
						data-unavailable={m.coverMissing}
					>
						<ol class="gallery-slides">
							{galleryImages.map((image, index) => {
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
								const existingAlt = String(image.alt).trim();
								const alt =
									!existingAlt || /^Julkaisun kuva \d+$/.test(existingAlt)
										? m.galleryAlt(
												String(post.title),
												index + 1,
												galleryImages.length,
											)
										: existingAlt;
								return (
									<li class="gallery-slide">
										<a
											class="gallery-image"
											href={url}
											data-alt={alt}
											data-preview={
												validMedia(image.preview_url)
													? image.preview_url
													: undefined
											}
										>
											<img
												data-image-fallback
												data-fallback-label={m.coverMissing}
												src={preview}
												alt={alt}
												width={previewWidth || undefined}
												height={previewHeight || undefined}
												srcSet={
													preview !== url &&
													previewWidth &&
													previewWidth < width
														? `${preview} ${previewWidth}w, ${url} ${width}w`
														: undefined
												}
												sizes="(max-width: 700px) 100vw, 32rem"
												loading={index === 0 ? "eager" : "lazy"}
											/>
										</a>
									</li>
								);
							})}
						</ol>
					</section>
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
								<InstagramIcon />
								{m.source}
							</a>
						</p>
					)}

					<p>
						<a
							href={(() => {
								const context = range(
									c.req.query("page"),
									c.req.query("through"),
								);
								return context
									? `/archive${archiveContext(context.start, context.end)}`
									: "/archive";
							})()}
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
