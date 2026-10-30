import type { FC } from "hono/jsx";
import { messages as m } from "#i18n/fi";
import { InstagramIcon } from "../components/instagram-icon.js";
import { Layout } from "../layout.js";

type AboutPageProps = {
	canonical: string;
	available: boolean;
	description: string;
	image?: { src: string; width?: number; height?: number };
};

export const AboutPage: FC<AboutPageProps> = ({
	canonical,
	available,
	description,
	image,
}) => (
	<Layout
		title={m.aboutTitle}
		canonical={canonical}
		description={description.slice(0, 160)}
	>
		<article class="about-page">
			<p class="eyebrow">Klamydiakokoelma</p>
			<h1 class="page-title">{m.aboutTitle}</h1>
			{available ? (
				<>
					<p class="about-date">
						<time dateTime="2023-01-02">{m.aboutWritten}</time>
					</p>
					<div class="about-content">
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
						<div>
							<p class="description">{description}</p>
							<p>
								<a
									class="source-link"
									href="https://www.instagram.com/klamydiakokoelma/"
								>
									<InstagramIcon />
									{m.followInstagram}
								</a>
							</p>
						</div>
					</div>
				</>
			) : (
				<p class="empty-state">{m.aboutUnavailable}</p>
			)}
		</article>
	</Layout>
);
