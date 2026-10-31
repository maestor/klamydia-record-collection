import type { FC } from "hono/jsx";
import { formatDate, messages as m } from "#i18n/fi";
import { archiveQuery } from "#presentation/archive";
import type { GalleryImage } from "#presentation/gallery";
import { Gallery } from "../components/gallery.js";
import { InstagramIcon } from "../components/instagram-icon.js";
import { PageHeading } from "../components/page-heading.js";
import { Layout } from "../layout.js";

type PostPageProps = {
	title: string;
	publishedAt: string;
	description: string;
	canonical: string;
	images: GalleryImage[];
	tags: { normalized: string; display: string }[];
	sourceUrl?: string;
	backHref: string;
};

export const PostPage: FC<PostPageProps> = ({
	title,
	publishedAt,
	description,
	canonical,
	images,
	tags,
	sourceUrl,
	backHref,
}) => (
	<Layout
		gallery={images.length > 0}
		title={title}
		canonical={canonical}
		description={description.slice(0, 160)}
	>
		<article class="post-detail">
			<PageHeading label={m.postLabel}>{title}</PageHeading>
			<time dateTime={publishedAt}>{formatDate(publishedAt)}</time>
			<h2 class="section-title" id="gallery-heading">
				{m.images}
			</h2>
			<Gallery images={images} />
			<p class="description">{description}</p>
			{tags.length > 0 && (
				<ul class="tags" aria-label={m.tags}>
					{tags.map((tag) => (
						<li>
							<a
								href={`/archive${archiveQuery(undefined, undefined, tag.normalized)}`}
							>
								{tag.display}
							</a>
						</li>
					))}
				</ul>
			)}
			{sourceUrl && (
				<p>
					<a class="source-link" href={sourceUrl}>
						<InstagramIcon />
						{m.source}
					</a>
				</p>
			)}

			<p>
				<a href={backHref}>{m.backArchive}</a>
			</p>
		</article>
	</Layout>
);
