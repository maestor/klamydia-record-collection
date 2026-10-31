import type { FC } from "hono/jsx";
import { formatDate, messages as m } from "#i18n/fi";
import { GitHubIcon } from "../components/github-icon.js";
import { InstagramIcon } from "../components/instagram-icon.js";
import { PageHeading } from "../components/page-heading.js";
import { Layout } from "../layout.js";

type AboutPageProps = {
	canonical: string;
	available: boolean;
	publishedAt?: string;
	description: string;
	image?: { src: string; width?: number; height?: number };
};

export const AboutPage: FC<AboutPageProps> = ({
	canonical,
	available,
	publishedAt,
	description,
	image,
}) => (
	<Layout
		title={m.aboutTitle}
		canonical={canonical}
		description={description.slice(0, 160)}
	>
		<article class="about-page">
			<PageHeading label={m.aboutLabel} titleClass="page-title">
				{m.aboutTitle}
			</PageHeading>
			<p class="about-links">
				<a
					class="source-link"
					href="https://www.instagram.com/klamydiakokoelma/"
				>
					<InstagramIcon />
					{m.followInstagram}
				</a>
				<span class="about-github-group">
					<span class="about-link-divider" aria-hidden="true">
						•
					</span>
					<a
						class="source-link"
						href="https://github.com/maestor/klamydia-record-collection"
					>
						<GitHubIcon />
						{m.siteImplementation}
					</a>
				</span>
			</p>
			<div class="about-content">
				{available && (
					<div class="about-image">
						{image ? (
							<img
								data-image-fallback
								data-fallback-label={m.coverMissing}
								src={image.src}
								alt={m.aboutImageAlt}
								width={image.width}
								height={image.height}
							/>
						) : (
							<p class="image-failure">{m.coverMissing}</p>
						)}
					</div>
				)}
				<section>
					<h2>{m.aboutIntroTitle}</h2>
					<p class="description">{m.aboutIntro}</p>
				</section>
				{available && publishedAt ? (
					<section>
						<h2>{m.aboutPostTitle(formatDate(publishedAt))}</h2>
						<p class="description">{description}</p>
					</section>
				) : (
					<p class="empty-state">{m.aboutUnavailable}</p>
				)}
			</div>
		</article>
	</Layout>
);
