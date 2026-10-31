import type { FC } from "hono/jsx";
import { formatDate, messages as m } from "#i18n/fi";
import { archiveQuery } from "#presentation/archive";
import { isMediaPath, previewDimensions } from "#presentation/media";
import type { PostSummary } from "#repositories/posts";

type PostItemsProps = {
	posts: PostSummary[];
	page?: number;
	through?: number;
	tag?: string;
	prioritizeFirst?: boolean;
};

export const PostItems: FC<PostItemsProps> = ({
	posts,
	page,
	through,
	tag,
	prioritizeFirst = false,
}) => (
	<>
		{posts.map((post, index) => {
			const dimensions = previewDimensions(post.cover_width, post.cover_height);
			return (
				<li>
					<article class="post-card">
						<a
							class="post-card-link"
							href={`/posts/${encodeURIComponent(post.slug)}${archiveQuery(page, through, tag)}`}
						>
							<div class="artwork">
								<span class="artwork-placeholder" aria-hidden="true">
									{m.coverMissing}
								</span>
								{isMediaPath(post.cover_url) && (
									<img
										data-image-fallback
										src={post.cover_url}
										alt=""
										width={dimensions.width}
										height={dimensions.height}
										loading={prioritizeFirst && index === 0 ? "eager" : "lazy"}
										fetchpriority={
											prioritizeFirst && index === 0 ? "high" : undefined
										}
									/>
								)}
							</div>
							<div class="post-card-details">
								<h2>{post.title}</h2>
							</div>
						</a>
						<div class="post-card-meta">
							<time dateTime={post.published_at}>
								{formatDate(post.published_at)}
							</time>
							{post.image_count > 1 && (
								<span>{m.imageCount(post.image_count)}</span>
							)}
						</div>
					</article>
				</li>
			);
		})}
	</>
);

export const PostList: FC<
	Omit<PostItemsProps, "prioritizeFirst"> & { archive?: boolean }
> = ({ posts, page, through, tag, archive }) =>
	posts.length ? (
		<ul class="post-list" id={archive ? "archive-list" : undefined}>
			<PostItems
				posts={posts}
				page={page}
				through={through}
				tag={tag}
				prioritizeFirst
			/>
		</ul>
	) : (
		<p class="empty-state">{tag ? m.emptyTag : m.empty}</p>
	);
