import type { FC } from "hono/jsx";
import { messages as m } from "#i18n/fi";
import type { PostSummary } from "#repositories/posts";
import { PageHeading } from "../components/page-heading.js";
import { PostList } from "../components/post-list.js";
import { Layout } from "../layout.js";

export const HomePage: FC<{ posts: PostSummary[]; canonical: string }> = ({
	posts,
	canonical,
}) => (
	<Layout title={m.home} fullTitle={m.homeTitle} canonical={canonical}>
		<section class="intro">
			<PageHeading label={m.introLabel}>
				Klamydia
				<wbr />
				kokoelma
			</PageHeading>
			<p>{m.intro}</p>
		</section>
		<h2 class="section-title">{m.latest}</h2>
		<PostList posts={posts} />
		<p class="archive-action">
			<a class="button" href="/archive">
				{m.allPosts} <span aria-hidden="true">→</span>
			</a>
		</p>
	</Layout>
);
