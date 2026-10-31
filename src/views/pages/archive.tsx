import type { FC } from "hono/jsx";
import { messages as m } from "#i18n/fi";
import { ARCHIVE_BATCH_LIMIT, archiveQuery } from "#presentation/archive";
import type { PostSummary } from "#repositories/posts";
import { PageHeading } from "../components/page-heading.js";
import { PostList } from "../components/post-list.js";
import { Layout } from "../layout.js";

type ArchivePageProps = {
	posts: PostSummary[];
	tag?: string;
	tags: { normalized: string; display: string; count: number }[];
	start: number;
	end: number;
	hasMore: boolean;
	canonical: string;
};

export const ArchivePage: FC<ArchivePageProps> = ({
	posts,
	tag,
	tags,
	start,
	end,
	hasMore,
	canonical,
}) => {
	const canAppend = end - start < ARCHIVE_BATCH_LIMIT - 1;
	const selectedTag =
		tag && (tags.find((item) => item.normalized === tag)?.display ?? tag);
	return (
		<Layout archive title={m.archive} canonical={canonical}>
			<PageHeading label={m.archiveLabel} titleClass="page-title">
				{m.archive}
			</PageHeading>
			{(tags.length > 0 || tag) && (
				<div class="archive-tags">
					<details>
						<summary>{m.filterTags}</summary>
						<ul class="tags" aria-label={m.tags}>
							{tags.map((item) => (
								<li>
									<a
										href={`/archive${archiveQuery(undefined, undefined, item.normalized)}`}
										aria-current={tag === item.normalized ? "true" : undefined}
									>
										{item.display} (
										{new Intl.NumberFormat("fi-FI").format(item.count)})
									</a>
								</li>
							))}
						</ul>
					</details>
					{selectedTag && (
						<p class="selected-tag">
							<span>{m.selectedTag}</span>{" "}
							<a href="/archive" aria-label={m.removeTag(selectedTag)}>
								{selectedTag} <span aria-hidden="true">×</span>
							</a>
						</p>
					)}
				</div>
			)}
			<section
				id="archive-results"
				aria-label={m.archive}
				aria-busy="false"
				data-tag={tag}
				data-start={start}
				data-end={end}
				data-batch-limit={ARCHIVE_BATCH_LIMIT}
				data-loading={m.archiveLoading}
				data-error={m.archiveError}
				data-retry={m.archiveRetry}
				data-more={m.loadMore}
				data-next={m.nextPage}
				data-end-message={m.archiveEnd}
				data-progress={m.archiveProgressTemplate}
				data-added={m.archiveAddedTemplate}
				data-page-label={m.archivePageTemplate}
			>
				<PostList posts={posts} page={start} through={end} tag={tag} archive />
				<p id="archive-status" role="status" aria-live="polite">
					{posts.length
						? `${m.archiveProgress(start, end, posts.length)}${hasMore ? "" : ` ${m.archiveEnd}`}`
						: ""}
				</p>
				<nav class="pagination" aria-label={m.archivePages}>
					{start > 1 && (
						<a href={`/archive${archiveQuery(start - 1, undefined, tag)}`}>
							{m.newer}
						</a>
					)}
					<span id="archive-page-label">{m.page(end)}</span>
					{hasMore ? (
						<a
							id="archive-more"
							class="button"
							href={`/archive${archiveQuery(end + 1, undefined, tag)}`}
							data-enhance={canAppend ? "true" : "false"}
						>
							{canAppend ? m.loadMore : m.nextPage}
						</a>
					) : (
						posts.length > 0 && <span id="archive-end">{m.archiveEnd}</span>
					)}
					{hasMore && (
						<a
							id="archive-fallback"
							href={`/archive${archiveQuery(end + 1, undefined, tag)}`}
							hidden
						>
							{m.archiveFallback}
						</a>
					)}
				</nav>
			</section>
		</Layout>
	);
};
