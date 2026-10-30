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

export async function listPosts(db: Client, limit: number, offset = 0) {
	return (
		await db.execute({
			sql: `SELECT p.slug, p.title, p.published_at,
			COALESCE(ii.preview_url, i.url) AS cover_url, ii.width AS cover_width, ii.height AS cover_height,
			(SELECT COUNT(*) FROM images counted WHERE counted.post_slug = p.slug) AS image_count
			FROM posts p
			LEFT JOIN images i ON i.post_slug = p.slug AND i.position = (SELECT MIN(first.position) FROM images first WHERE first.post_slug = p.slug)
			LEFT JOIN instagram_images ii ON ii.post_slug = i.post_slug AND ii.position = i.position
			WHERE NOT EXISTS (SELECT 1 FROM instagram_posts ip WHERE ip.post_slug = p.slug AND ip.media_id = ?)
			ORDER BY p.published_at DESC, p.slug DESC LIMIT ? OFFSET ?`,
			args: [ABOUT_MEDIA_ID, limit, offset],
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
export async function getPost(db: Client, slug: string) {
	return (
		await db.execute({
			sql: "SELECT p.slug, p.title, p.published_at, p.description, ip.permalink FROM posts p LEFT JOIN instagram_posts ip ON ip.post_slug = p.slug WHERE p.slug = ?",
			args: [slug],
		})
	).rows[0];
}
export async function getImages(db: Client, slug: string) {
	return (
		await db.execute({
			sql: "SELECT i.url, i.alt, ii.preview_url, ii.width, ii.height, ii.media_id FROM images i LEFT JOIN instagram_images ii ON ii.post_slug = i.post_slug AND ii.position = i.position WHERE i.post_slug = ? ORDER BY i.position",
			args: [slug],
		})
	).rows;
}
export async function getTags(db: Client, slug: string) {
	return (
		await db.execute({
			sql: "SELECT t.display FROM tags t JOIN post_tags pt ON pt.tag_normalized = t.normalized WHERE pt.post_slug = ? ORDER BY t.normalized",
			args: [slug],
		})
	).rows;
}

export async function getAboutPost(db: Client) {
	return (
		await db.execute({
			sql: "SELECT p.slug, p.title, p.description FROM posts p JOIN instagram_posts ip ON ip.post_slug = p.slug WHERE ip.media_id = ?",
			args: [ABOUT_MEDIA_ID],
		})
	).rows[0];
}
