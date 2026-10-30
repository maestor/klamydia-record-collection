import type { Client } from "@libsql/client";
import { Hono } from "hono";
import { messages as m } from "#i18n/fi";
import {
	ARCHIVE_BATCH_LIMIT,
	archiveQuery,
	isValidPage,
	parseArchiveRange,
} from "#presentation/archive";
import { listPosts } from "#repositories/posts";
import { PostItems } from "#views/components/post-list";
import { ArchivePage } from "#views/pages/archive";
import { HomePage } from "#views/pages/home";
import { MessagePage } from "#views/pages/message";

const PAGE_SIZE = 12;

export function createCollectionRoutes(db: Client, siteUrl: string) {
	const app = new Hono();
	app.get("/", async (c) => {
		const posts = await listPosts(db, 6);
		return c.html(<HomePage posts={posts} canonical={`${siteUrl}/`} />);
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
		const rows = await listPosts(db, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE);
		c.header("X-Archive-Count", String(Math.min(rows.length, PAGE_SIZE)));
		c.header("X-Archive-Has-More", String(rows.length > PAGE_SIZE));
		return c.html(
			<PostItems
				posts={rows.slice(0, PAGE_SIZE)}
				page={start}
				through={page}
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
		const limit = (end - start + 1) * PAGE_SIZE;
		const posts = await listPosts(db, limit + 1, (start - 1) * PAGE_SIZE);
		return c.html(
			<ArchivePage
				posts={posts.slice(0, limit)}
				start={start}
				end={end}
				hasMore={posts.length > limit && end < 999999}
				canonical={`${siteUrl}/archive${archiveQuery(start, end)}`}
			/>,
		);
	});
	return app;
}
