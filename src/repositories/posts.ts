import type { Client } from "@libsql/client";

export type PostSummary = {
	slug: string;
	title: string;
	published_at: string;
	cover_url: string | null;
	image_count: number;
};

export async function listPosts(db: Client, limit: number, offset = 0) {
	return (
		await db.execute({
			sql: `SELECT p.slug, p.title, p.published_at,
			(SELECT COALESCE(ii.preview_url, i.url) FROM images i LEFT JOIN instagram_images ii ON ii.post_slug = i.post_slug AND ii.position = i.position WHERE i.post_slug = p.slug ORDER BY i.position LIMIT 1) AS cover_url,
			(SELECT COUNT(*) FROM images i WHERE i.post_slug = p.slug) AS image_count
			FROM posts p ORDER BY p.published_at DESC, p.slug DESC LIMIT ? OFFSET ?`,
			args: [limit, offset],
		})
	).rows.map(
		(row): PostSummary => ({
			slug: String(row.slug),
			title: String(row.title),
			published_at: String(row.published_at),
			cover_url: row.cover_url === null ? null : String(row.cover_url),
			image_count: Number(row.image_count),
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
