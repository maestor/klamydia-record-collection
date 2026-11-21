import type { Client } from "@libsql/client";
import { Hono } from "hono";
import { messages as m } from "#i18n/fi";
import {
	ARCHIVE_BATCH_LIMIT,
	archiveQuery,
	isValidPage,
	parseArchiveRange,
} from "#presentation/archive";
import { getCollectionCounts } from "#repositories/collection-counts";
import { listArchiveTags, listPosts } from "#repositories/posts";
import { PostItems } from "#views/components/post-list";
import { ArchivePage } from "#views/pages/archive";
import { HomePage } from "#views/pages/home";
import { MessagePage } from "#views/pages/message";

const ARCHIVE_PAGE_SIZE = 12;
const HOME_POST_LIMIT = 6;

export function createCollectionRoutes(db: Client, siteUrl: string) {
	const app = new Hono();
	app.get("/", async (c) => {
		const [posts, counts] = await Promise.all([
			listPosts(db, { limit: HOME_POST_LIMIT }),
			getCollectionCounts(db),
		]);
		return c.html(
			<HomePage counts={counts} posts={posts} canonical={`${siteUrl}/`} />,
		);
	});
	app.get("/archive/fragments", async (c) => {
		const rawPage = c.req.query("page");
		const rawStart = c.req.query("start");
		if (!isValidPage(rawPage) || !isValidPage(rawStart))
			return c.text(m.invalidPage, 400);
		const start = Number(rawStart);
		const page = Number(rawPage);
		if (page <= start || page - start >= ARCHIVE_BATCH_LIMIT)
			return c.text(m.invalidPage, 400);
		const tag = c.req.query("tag") || undefined;
		const posts = await listPosts(db, {
			limit: ARCHIVE_PAGE_SIZE + 1,
			offset: (page - 1) * ARCHIVE_PAGE_SIZE,
			tag,
		});
		c.header(
			"X-Archive-Count",
			String(Math.min(posts.length, ARCHIVE_PAGE_SIZE)),
		);
		c.header("X-Archive-Has-More", String(posts.length > ARCHIVE_PAGE_SIZE));
		return c.html(
			<PostItems
				posts={posts.slice(0, ARCHIVE_PAGE_SIZE)}
				page={start}
				through={page}
				tag={tag}
			/>,
		);
	});
	app.get("/archive", async (c) => {
		const selection = parseArchiveRange(
			c.req.query("page"),
			c.req.query("through"),
		);
		if (!selection)
			return c.html(
				<MessagePage title={m.invalidTitle} message={m.invalidPage} />,
				400,
			);
		const { start, end } = selection;
		const limit = (end - start + 1) * ARCHIVE_PAGE_SIZE;
		const tag = c.req.query("tag") || undefined;
		const [posts, tags] = await Promise.all([
			listPosts(db, {
				limit: limit + 1,
				offset: (start - 1) * ARCHIVE_PAGE_SIZE,
				tag,
			}),
			listArchiveTags(db),
		]);
		return c.html(
			<ArchivePage
				posts={posts.slice(0, limit)}
				tag={tag}
				tags={tags}
				start={start}
				end={end}
				hasMore={posts.length > limit && end < 999999}
				canonical={`${siteUrl}/archive${archiveQuery(start, end, tag)}`}
			/>,
		);
	});
	return app;
}
