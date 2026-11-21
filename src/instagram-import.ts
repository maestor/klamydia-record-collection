import { createHash } from "node:crypto";
import type { Client, InStatement } from "@libsql/client";
import sharp from "sharp";
import { instagramReader } from "./instagram-access.js";
import { fetchWithRetry } from "./instagram-fetch.js";

const MAX_IMPORT_POSTS = 1000;
const MAX_IMAGES_PER_POST = 100;

const MAX_IMAGE_DOWNLOAD_BYTES = 15_000_000;
const MAX_IMAGE_INPUT_PIXELS = 40_000_000;

type InstagramImportOptions = {
	db: Client;
	accountId: string;
	token: string;
	fetcher?: typeof fetch;
	limit?: number;
	mediaId?: string;
	dryRun?: boolean;
	putImage?: (filename: string, bytes: Buffer) => Promise<void>;
};

async function downloadFullImage(
	fetcher: typeof fetch,
	mediaUrl: string,
	postId: string,
): Promise<Buffer> {
	let url: URL;
	try {
		url = new URL(mediaUrl);
	} catch {
		throw new Error(`Invalid image source for post ${postId}.`);
	}
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.port ||
		![".cdninstagram.com", ".fbcdn.net"].some((suffix) =>
			url.hostname.endsWith(suffix),
		)
	)
		throw new Error(`Invalid image source for post ${postId}.`);
	let response: Response;
	try {
		response = await fetchWithRetry(fetcher, url, {});
	} catch {
		throw new Error(`Image download failed for post ${postId}.`);
	}
	if (!response.ok || !response.body)
		throw new Error(
			`Image download failed for post ${postId} (HTTP ${response.status}).`,
		);
	const chunks: Uint8Array[] = [];
	let sizeBytes = 0;
	try {
		for await (const chunk of response.body) {
			sizeBytes += chunk.length;
			if (sizeBytes > MAX_IMAGE_DOWNLOAD_BYTES) throw new Error("size limit");
			chunks.push(chunk);
		}
	} catch {
		throw new Error(
			`Image download failed or exceeded size limit for post ${postId}.`,
		);
	}
	try {
		const input = Buffer.concat(chunks);
		const metadata = await sharp(input, {
			limitInputPixels: MAX_IMAGE_INPUT_PIXELS,
			failOn: "error",
		}).metadata();
		if (
			!metadata.format ||
			!["jpeg", "png", "webp"].includes(metadata.format) ||
			!metadata.width ||
			!metadata.height ||
			(metadata.pages ?? 1) !== 1
		)
			throw new Error("Unsupported image.");
		return await sharp(input, {
			limitInputPixels: MAX_IMAGE_INPUT_PIXELS,
			failOn: "error",
		})
			.rotate()
			.resize({
				width: 1440,
				height: 1440,
				fit: "inside",
				withoutEnlargement: true,
			})
			.jpeg({ quality: 90 })
			.toBuffer();
	} catch {
		throw new Error(`Invalid image for post ${postId}.`);
	}
}

export async function importInstagram({
	db,
	accountId,
	token,
	fetcher = fetch,
	limit,
	mediaId,
	dryRun = false,
	putImage,
}: InstagramImportOptions) {
	if (!dryRun && !putImage)
		throw new Error("A media store is required for imports.");
	if (
		limit !== undefined &&
		(!Number.isInteger(limit) || limit < 1 || limit > MAX_IMPORT_POSTS)
	)
		throw new Error(`Limit must be an integer from 1 to ${MAX_IMPORT_POSTS}.`);
	if (mediaId !== undefined && (!/^\d+$/.test(mediaId) || limit !== undefined))
		throw new Error("Use one numeric media ID or a limit, not both.");
	const reader = instagramReader(accountId, token, fetcher);
	const media = (await reader.getMedia()).sort(
		(a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
	);
	const selected = mediaId
		? media.filter((post) => post.id === mediaId)
		: limit
			? media.slice(0, limit)
			: media;
	if (mediaId && selected.length === 0)
		throw new Error("The requested media ID was not found.");
	if (selected.length > MAX_IMPORT_POSTS)
		throw new Error(
			`Import exceeds ${MAX_IMPORT_POSTS} posts; use a bounded sample and revisit the work limit.`,
		);
	if (new Set(selected.map((post) => post.id)).size !== selected.length)
		throw new Error(
			"Instagram returned duplicate posts; no posts were published.",
		);
	const statements: InStatement[] = [];
	const counts = { created: 0, updated: 0, unchanged: 0 };
	async function storeImage(bytes: Buffer) {
		const filename = `${createHash("sha256").update(bytes).digest("hex")}.jpg`;
		if (!dryRun && putImage) await putImage(filename, bytes);
		return { filename, url: `/media/${filename}` };
	}
	for (const post of selected) {
		if (
			(post.caption !== undefined && typeof post.caption !== "string") ||
			typeof post.permalink !== "string" ||
			!/^https:\/\/www\.instagram\.com\/p\/[A-Za-z0-9_-]+\/?$/.test(
				post.permalink,
			)
		)
			throw new Error(`Invalid metadata for post ${post.id}.`);
		if (!["IMAGE", "CAROUSEL_ALBUM"].includes(post.media_type))
			throw new Error(
				`Unsupported media type for post ${post.id}; no posts were published.`,
			);
		const children =
			post.media_type === "IMAGE" ? [post] : await reader.getChildren(post.id);
		if (
			!children.length ||
			children.length > MAX_IMAGES_PER_POST ||
			!children.every(
				(child): child is typeof child & { media_url: string } =>
					child.media_type === "IMAGE" && typeof child.media_url === "string",
			)
		)
			throw new Error(
				`Post ${post.id} has missing or unsupported media; no posts were published.`,
			);
		if (new Set(children.map((child) => child.id)).size !== children.length)
			throw new Error(
				`Post ${post.id} has duplicate children; no posts were published.`,
			);
		const images: {
			url: string;
			preview: string;
			id: string;
			width: number;
			height: number;
			hash: string;
		}[] = [];
		for (const child of children) {
			const image = await downloadFullImage(fetcher, child.media_url, post.id);
			const original = await storeImage(image);
			const previewBytes = await sharp(image)
				.resize({
					width: 640,
					height: 640,
					fit: "inside",
					withoutEnlargement: true,
				})
				.jpeg({ quality: 80, mozjpeg: true })
				.toBuffer();
			const preview = await storeImage(previewBytes);
			const dimensions = await sharp(image).metadata();
			if (!dimensions.width || !dimensions.height)
				throw new Error(`Invalid output image for post ${post.id}.`);
			images.push({
				url: original.url,
				preview: preview.url,
				id: child.id,
				width: dimensions.width,
				height: dimensions.height,
				hash: original.filename.slice(0, -4),
			});
		}
		const fingerprint = createHash("sha256")
			.update(
				JSON.stringify([
					post.caption ?? "",
					post.timestamp,
					post.permalink,
					images,
				]),
			)
			.digest("hex");
		const existing = (
			await db.execute({
				sql: "SELECT post_slug, fingerprint FROM instagram_posts WHERE media_id = ?",
				args: [post.id],
			})
		).rows[0];
		if (existing?.fingerprint === fingerprint) {
			counts.unchanged++;
			continue;
		}
		const slug = existing ? String(existing.post_slug) : `instagram-${post.id}`;
		if (
			!existing &&
			(
				await db.execute({
					sql: "SELECT slug FROM posts WHERE slug = ?",
					args: [slug],
				})
			).rows.length
		)
			throw new Error(
				`Post key conflict for ${post.id}; no posts were published.`,
			);
		if (existing) counts.updated++;
		else counts.created++;
		const firstLine = (post.caption ?? "")
			.split(/\r?\n/)
			.find((line) => line.trim())
			?.trim();
		const title =
			firstLine && firstLine.length <= 100 && !firstLine.startsWith("#")
				? firstLine
				: `Instagram-julkaisu ${post.timestamp.slice(0, 10)}`;
		statements.push({
			sql: "INSERT INTO posts (slug,title,published_at,description) VALUES (?,?,?,?) ON CONFLICT(slug) DO UPDATE SET published_at=excluded.published_at, description=excluded.description",
			args: [
				slug,
				title,
				new Date(post.timestamp).toISOString(),
				post.caption ?? "",
			],
		});
		statements.push({
			sql: "INSERT INTO instagram_posts (media_id,post_slug,permalink,fingerprint,media_type,imported_at) VALUES (?,?,?,?,?,?) ON CONFLICT(media_id) DO UPDATE SET permalink=excluded.permalink,fingerprint=excluded.fingerprint,media_type=excluded.media_type,imported_at=excluded.imported_at",
			args: [
				post.id,
				slug,
				post.permalink,
				fingerprint,
				post.media_type,
				new Date().toISOString(),
			],
		});
		// Save owner-edited descriptions against stable media IDs before positions change.
		statements.push({
			sql: `INSERT INTO image_editorial (media_id, alt)
				SELECT ii.media_id, i.alt FROM images i JOIN instagram_images ii
				ON ii.post_slug = i.post_slug AND ii.position = i.position
				WHERE i.post_slug = ? AND i.alt != 'Julkaisun kuva ' || i.position
				ON CONFLICT(media_id) DO UPDATE SET alt = excluded.alt`,
			args: [slug],
		});
		statements.push({
			sql: "DELETE FROM images WHERE post_slug = ?",
			args: [slug],
		});
		statements.push({
			sql: "DELETE FROM instagram_images WHERE post_slug = ?",
			args: [slug],
		});
		images.forEach((image, index) => {
			statements.push({
				sql: "INSERT INTO images (post_slug, position, url, alt) VALUES (?,?,?,COALESCE((SELECT alt FROM image_editorial WHERE media_id = ?), ?))",
				args: [
					slug,
					index + 1,
					image.url,
					image.id,
					`Julkaisun kuva ${index + 1}`,
				],
			});
			statements.push({
				sql: "INSERT INTO instagram_images (post_slug,position,media_id,width,height,format,content_hash,preview_url) VALUES (?,?,?,?,?,?,?,?)",
				args: [
					slug,
					index + 1,
					image.id,
					image.width,
					image.height,
					"jpeg",
					image.hash,
					image.preview,
				],
			});
		});
		statements.push({
			sql: "DELETE FROM post_tags WHERE post_slug = ?",
			args: [slug],
		});
		const tags = new Map<string, string>();
		for (const match of (post.caption ?? "").matchAll(/#([\p{L}\p{N}_]+)/gu)) {
			const display = match[1].normalize("NFC");
			const normalized = display.toLocaleLowerCase("fi");
			if (!tags.has(normalized)) tags.set(normalized, display);
		}
		for (const [normalized, display] of tags) {
			statements.push({
				sql: "INSERT INTO tags (normalized,display) VALUES (?,?) ON CONFLICT(normalized) DO NOTHING",
				args: [normalized, display],
			});
			statements.push({
				sql: "INSERT INTO post_tags (post_slug,tag_normalized) VALUES (?,?)",
				args: [slug, normalized],
			});
		}
	}
	if (!dryRun && statements.length) await db.batch(statements, "write");
	return { ...counts, total: selected.length, dryRun };
}
