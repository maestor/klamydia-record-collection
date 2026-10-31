import type { Client } from "@libsql/client";

export const ABOUT_MEDIA_ID = "17970239393043334";

export type PostSummary = {
	slug: string;
	title: string;
	published_at: string;
	cover_url: string | null;
	image_count: number;
	cover_width: number | null;
	cover_height: number | null;
};

export type Post = {
	slug: string;
	title: string;
	published_at: string;
	description: string;
	permalink: string | null;
};

export type AboutPost = Pick<
	Post,
	"slug" | "title" | "description" | "published_at"
>;

export type PostImage = {
	url: string;
	alt: string;
	preview_url: string | null;
	width: number | null;
	height: number | null;
};

export async function listPosts(
	db: Client,
	limit: number,
	offset = 0,
	tag?: string,
) {
	return (
		await db.execute({
			sql: `SELECT p.slug, p.title, p.published_at,
			COALESCE(ii.preview_url, i.url) AS cover_url, ii.width AS cover_width, ii.height AS cover_height,
			(SELECT COUNT(*) FROM images counted WHERE counted.post_slug = p.slug) AS image_count
			FROM posts p
			LEFT JOIN images i ON i.post_slug = p.slug AND i.position = (SELECT MIN(first.position) FROM images first WHERE first.post_slug = p.slug)
			LEFT JOIN instagram_images ii ON ii.post_slug = i.post_slug AND ii.position = i.position
			WHERE NOT EXISTS (SELECT 1 FROM instagram_posts ip WHERE ip.post_slug = p.slug AND ip.media_id = ?)
			AND (? IS NULL OR EXISTS (SELECT 1 FROM post_tags pt WHERE pt.post_slug = p.slug AND pt.tag_normalized = ?))
			ORDER BY p.published_at DESC, p.slug DESC LIMIT ? OFFSET ?`,
			args: [ABOUT_MEDIA_ID, tag ?? null, tag ?? null, limit, offset],
		})
	).rows.map(
		(row): PostSummary => ({
			slug: String(row.slug),
			title: String(row.title),
			published_at: String(row.published_at),
			cover_url: row.cover_url === null ? null : String(row.cover_url),
			image_count: Number(row.image_count),
			cover_width: row.cover_width === null ? null : Number(row.cover_width),
			cover_height: row.cover_height === null ? null : Number(row.cover_height),
		}),
	);
}
export async function getPost(
	db: Client,
	slug: string,
): Promise<Post | undefined> {
	const row = (
		await db.execute({
			sql: "SELECT p.slug, p.title, p.published_at, p.description, ip.permalink FROM posts p LEFT JOIN instagram_posts ip ON ip.post_slug = p.slug WHERE p.slug = ?",
			args: [slug],
		})
	).rows[0];
	return row
		? {
				slug: String(row.slug),
				title: String(row.title),
				published_at: String(row.published_at),
				description: String(row.description),
				permalink: row.permalink === null ? null : String(row.permalink),
			}
		: undefined;
}
export async function getImages(
	db: Client,
	slug: string,
): Promise<PostImage[]> {
	return (
		await db.execute({
			sql: "SELECT i.url, i.alt, ii.preview_url, ii.width, ii.height FROM images i LEFT JOIN instagram_images ii ON ii.post_slug = i.post_slug AND ii.position = i.position WHERE i.post_slug = ? ORDER BY i.position",
			args: [slug],
		})
	).rows.map((row) => ({
		url: String(row.url),
		alt: String(row.alt),
		preview_url: row.preview_url === null ? null : String(row.preview_url),
		width: row.width === null ? null : Number(row.width),
		height: row.height === null ? null : Number(row.height),
	}));
}
export async function getTags(db: Client, slug: string) {
	return (
		await db.execute({
			sql: "SELECT t.normalized, t.display FROM tags t JOIN post_tags pt ON pt.tag_normalized = t.normalized WHERE pt.post_slug = ? ORDER BY t.normalized",
			args: [slug],
		})
	).rows
		.map((row) => ({
			normalized: String(row.normalized),
			display: String(row.display),
			count: Number(row.post_count),
		}))
		.sort(
			(a, b) =>
				b.count - a.count || a.display.localeCompare(b.display, "fi-FI"),
		);
}

export async function getAboutPost(db: Client): Promise<AboutPost | undefined> {
	const row = (
		await db.execute({
			sql: "SELECT p.slug, p.title, p.description, p.published_at FROM posts p JOIN instagram_posts ip ON ip.post_slug = p.slug WHERE ip.media_id = ?",
			args: [ABOUT_MEDIA_ID],
		})
	).rows[0];
	return row
		? {
				slug: String(row.slug),
				title: String(row.title),
				description: String(row.description),
				published_at: String(row.published_at),
			}
		: undefined;
}

export async function listPostSlugs(db: Client): Promise<string[]> {
	const posts = await db.execute({
		sql: "SELECT p.slug FROM posts p WHERE NOT EXISTS (SELECT 1 FROM instagram_posts ip WHERE ip.post_slug = p.slug AND ip.media_id = ?) ORDER BY p.published_at DESC, p.slug DESC",
		args: [ABOUT_MEDIA_ID],
	});
	return posts.rows.map((row) => String(row.slug));
}

export async function listArchiveTags(db: Client) {
	return (
		await db.execute({
			sql: `SELECT t.normalized, t.display, COUNT(*) AS post_count FROM tags t
		JOIN post_tags pt ON pt.tag_normalized = t.normalized
		JOIN posts p ON p.slug = pt.post_slug
		WHERE NOT EXISTS (SELECT 1 FROM instagram_posts ip WHERE ip.post_slug = p.slug AND ip.media_id = ?)
		GROUP BY t.normalized, t.display`,
			args: [ABOUT_MEDIA_ID],
		})
	).rows
		.map((row) => ({
			normalized: String(row.normalized),
			display: String(row.display),
			count: Number(row.post_count),
		}))
		.sort(
			(a, b) =>
				b.count - a.count || a.display.localeCompare(b.display, "fi-FI"),
		);
}
