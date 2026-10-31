import type { Client } from "@libsql/client";
import { Hono } from "hono";
import { messages as m } from "#i18n/fi";
import { archiveQuery, parseArchiveRange } from "#presentation/archive";
import { presentDescription } from "#presentation/description";
import { presentGallery } from "#presentation/gallery";
import { isMediaPath } from "#presentation/media";
import { getAboutPost, getImages, getPost, getTags } from "#repositories/posts";
import { AboutPage } from "#views/pages/about";
import { MessagePage } from "#views/pages/message";
import { PostPage } from "#views/pages/post";

export function createPostRoutes(db: Client, siteUrl: string) {
	const app = new Hono();
	app.get("/about", async (c) => {
		const post = await getAboutPost(db);
		const images = post ? await getImages(db, post.slug) : [];
		const image = images[0];
		const illustration =
			image && isMediaPath(image.url)
				? {
						src: isMediaPath(image.preview_url) ? image.preview_url : image.url,
						width: image.width || undefined,
						height: image.height || undefined,
					}
				: undefined;
		const description = post
			? presentDescription(post.title, post.description).text
			: "";
		return c.html(
			<AboutPage
				canonical={`${siteUrl}/about`}
				available={Boolean(post)}
				publishedAt={post?.published_at}
				description={description}
				image={illustration}
			/>,
		);
	});
	app.get("/posts/:slug", async (c) => {
		const slug = c.req.param("slug");
		const about = await getAboutPost(db);
		if (about && about.slug === slug) return c.redirect("/about", 302);
		const post = await getPost(db, slug);
		if (!post)
			return c.html(
				<MessagePage title={m.notFound} message={m.postNotFound} />,
				404,
			);
		const [images, tags] = await Promise.all([
			getImages(db, slug),
			getTags(db, slug),
		]);
		const context = parseArchiveRange(
			c.req.query("page"),
			c.req.query("through"),
		);
		const permalink = post.permalink ?? "";
		const sourceUrl =
			/^https:\/\/www\.instagram\.com\/p\/[A-Za-z0-9_-]+\/?$/.test(permalink)
				? permalink
				: undefined;
		return c.html(
			<PostPage
				title={post.title}
				publishedAt={post.published_at}
				description={presentDescription(post.title, post.description).text}
				canonical={`${siteUrl}/posts/${encodeURIComponent(post.slug)}`}
				images={presentGallery(images, post.title)}
				tags={tags}
				sourceUrl={sourceUrl}
				backHref={
					context
						? `/archive${archiveQuery(context.start, context.end)}`
						: "/archive"
				}
			/>,
		);
	});
	return app;
}
