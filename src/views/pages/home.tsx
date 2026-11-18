import type { FC } from "hono/jsx";
import { messages as m } from "#i18n/fi";
import type { CollectionCounts } from "#repositories/collection-counts";
import type { PostSummary } from "#repositories/posts";
import { PageHeading } from "../components/page-heading.js";
import { PostList } from "../components/post-list.js";
import { Layout } from "../layout.js";

type HomePageProps = {
	posts: PostSummary[];
	canonical: string;
	counts: CollectionCounts;
};

export const HomePage: FC<HomePageProps> = ({ posts, counts, canonical }) => (
	<Layout title={m.home} fullTitle={m.homeTitle} canonical={canonical}>
		<section class="intro">
			<PageHeading label={m.introLabel}>
				Klamydia
				<wbr />
				kokoelma
			</PageHeading>
			{m.intro.map((paragraph) => (
				<p>{paragraph}</p>
			))}
		</section>
		<section aria-labelledby="collection-numbers">
			<h2 id="collection-numbers" class="section-title">
				{m.collectionNumbers}
			</h2>
			<dl class="collection-counts">
				<div>
					<dt>{m.collectionTotal}</dt>
					<dd>{counts.total}</dd>
				</div>
				{counts.folders.map(({ category, count }) => (
					<div>
						<dt>{m.collectionFolders[category]}</dt>
						<dd>{count}</dd>
					</div>
				))}
			</dl>
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
