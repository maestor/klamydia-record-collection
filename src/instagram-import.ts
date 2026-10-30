import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Client, InStatement } from "@libsql/client";
import sharp from "sharp";
import { instagramReader } from "./instagram-access.js";
import { fetchWithRetry } from "./instagram-fetch.js";

type Options = {
	db: Client;
	mediaDir: string;
	accountId: string;
	token: string;
	fetcher?: typeof fetch;
	limit?: number;
	mediaId?: string;
	dryRun?: boolean;
	putImage?: (filename: string, bytes: Buffer) => Promise<void>;
};

export async function importInstagram({
	db,
	mediaDir,
	accountId,
	token,
	fetcher = fetch,
	limit,
	mediaId,
	dryRun = false,
	putImage,
}: Options) {
	if (
		limit !== undefined &&
		(!Number.isInteger(limit) || limit < 1 || limit > 1000)
	)
		throw new Error("Limit must be an integer from 1 to 1000.");
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
	if (selected.length > 1000)
		throw new Error(
			"Import exceeds 1000 posts; use a bounded sample and revisit the work limit.",
		);
	if (new Set(selected.map((post) => post.id)).size !== selected.length)
		throw new Error(
			"Instagram returned duplicate posts; no posts were published.",
		);
	const statements: InStatement[] = [];
	const counts = { created: 0, updated: 0, unchanged: 0 };
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
			post.media_type === "IMAGE"
				? [
						{
							id: post.id,
							media_type: post.media_type,
							media_url: post.media_url,
						},
					]
				: await reader.getChildren(post.id);
		if (
			!children.length ||
			children.length > 100 ||
			children.some(
				(child) =>
					child.media_type !== "IMAGE" || typeof child.media_url !== "string",
			)
		)
			throw new Error(
				`Post ${post.id} has missing or unsupported media; no posts were published.`,
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
			let url: URL;
			try {
				url = new URL(child.media_url as string);
			} catch {
				throw new Error(`Invalid image source for post ${post.id}.`);
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
				throw new Error(`Invalid image source for post ${post.id}.`);
			let response: Response;
			try {
				response = await fetchWithRetry(fetcher, url, {});
			} catch {
				throw new Error(`Image download failed for post ${post.id}.`);
			}
			if (!response.ok || !response.body)
				throw new Error(
					`Image download failed for post ${post.id} (HTTP ${response.status}).`,
				);
			const chunks: Uint8Array[] = [];
			let size = 0;
			try {
				for await (const chunk of response.body) {
					size += chunk.length;
					if (size > 15_000_000) throw new Error("size limit");
					chunks.push(chunk);
				}
			} catch {
				throw new Error(
					`Image download failed or exceeded size limit for post ${post.id}.`,
				);
			}
			let image: Buffer;
			try {
				const input = Buffer.concat(chunks);
				const metadata = await sharp(input, {
					limitInputPixels: 40_000_000,
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
				image = await sharp(input, {
					limitInputPixels: 40_000_000,
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
				throw new Error(`Invalid image for post ${post.id}.`);
			}
			async function storeImage(bytes: Buffer) {
				const filename = `${createHash("sha256").update(bytes).digest("hex")}.jpg`;
				if (!dryRun && putImage) await putImage(filename, bytes);
				else if (!dryRun) {
					await mkdir(mediaDir, { recursive: true });
					const temp = join(mediaDir, `.staging-${randomUUID()}`);
					await writeFile(temp, bytes, { flag: "wx" });
					try {
						try {
							await link(temp, join(mediaDir, filename));
						} catch (error) {
							if ((error as NodeJS.ErrnoException).code !== "EEXIST")
								throw error;
							const present = await readFile(join(mediaDir, filename));
							if (!present.equals(bytes))
								throw new Error(
									`Existing image failed integrity check for post ${post.id}.`,
								);
						}
					} finally {
						await unlink(temp);
					}
				}
				return { filename, url: `/media/${filename}` };
			}
			const original = await storeImage(image);
			const previewBytes = await sharp(image)
				.resize({
					width: 640,
					height: 640,
					fit: "inside",
					withoutEnlargement: true,
				})
				.jpeg({ quality: 85 })
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
				sql: "INSERT INTO images (post_slug, position, url, alt) VALUES (?,?,?,?)",
				args: [slug, index + 1, image.url, `Julkaisun kuva ${index + 1}`],
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
