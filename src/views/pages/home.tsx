import type { FC } from "hono/jsx";
import { messages as m } from "#i18n/fi";
import type { PostSummary } from "#repositories/posts";
import { PostList } from "../components/post-list.js";
import { Layout } from "../layout.js";

export const HomePage: FC<{ posts: PostSummary[]; canonical: string }> = ({
	posts,
	canonical,
}) => (
	<Layout title={m.home} canonical={canonical}>
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
	</Layout>
);
