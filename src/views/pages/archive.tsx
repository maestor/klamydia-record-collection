import type { FC } from "hono/jsx";
import { messages as m } from "#i18n/fi";
import { ARCHIVE_BATCH_LIMIT } from "#presentation/archive";
import type { PostSummary } from "#repositories/posts";
import { PostList } from "../components/post-list.js";
import { Layout } from "../layout.js";

type ArchivePageProps = {
	posts: PostSummary[];
	start: number;
	end: number;
	hasMore: boolean;
	canonical: string;
};

export const ArchivePage: FC<ArchivePageProps> = ({
	posts,
	start,
	end,
	hasMore,
	canonical,
}) => {
	const canAppend = end - start < ARCHIVE_BATCH_LIMIT - 1;
	return (
		<Layout archive title={m.archive} canonical={canonical}>
			<p class="eyebrow">{m.archiveLabel}</p>
			<h1 class="page-title">{m.archive}</h1>
			<section
				id="archive-results"
				aria-label={m.archive}
				aria-busy="false"
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
				<PostList posts={posts} page={start} through={end} archive />
				<p id="archive-status" role="status" aria-live="polite">
					{posts.length
						? `${m.archiveProgress(start, end, posts.length)}${hasMore ? "" : ` ${m.archiveEnd}`}`
						: ""}
				</p>
				<nav class="pagination" aria-label={m.archivePages}>
					{start > 1 && (
						<a href={start === 2 ? "/archive" : `/archive?page=${start - 1}`}>
							{m.newer}
						</a>
					)}
					<span id="archive-page-label">{m.page(end)}</span>
					{hasMore ? (
						<a
							id="archive-more"
							class="button"
							href={`/archive?page=${end + 1}`}
							data-enhance={canAppend ? "true" : "false"}
						>
							{canAppend ? m.loadMore : m.nextPage}
						</a>
					) : (
						posts.length > 0 && <span id="archive-end">{m.archiveEnd}</span>
					)}
					{hasMore && (
						<a id="archive-fallback" href={`/archive?page=${end + 1}`} hidden>
							{m.archiveFallback}
						</a>
					)}
				</nav>
			</section>
		</Layout>
	);
};
