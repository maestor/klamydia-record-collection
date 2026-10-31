import type { FC } from "hono/jsx";
import { messages as m } from "#i18n/fi";
import type { GalleryImage } from "#presentation/gallery";

export const Gallery: FC<{ images: GalleryImage[] }> = ({ images }) => (
	<section
		class="gallery"
		aria-labelledby="gallery-heading"
		data-previous={m.galleryPrevious}
		data-next={m.galleryNext}
		data-status={m.galleryStatus}
		data-thumbnail={m.galleryThumbnail}
		data-pagination={m.galleryPagination}
		data-thumbnails={m.galleryThumbnails}
		data-dialog={m.galleryDialog}
		data-enlarge={m.galleryEnlarge}
		data-close={m.galleryClose}
		data-unavailable={m.coverMissing}
	>
		<ol class="gallery-slides">
			{images.map((image, index) => (
				<li class="gallery-slide">
					<a
						class="gallery-image"
						href={image.url}
						data-alt={image.alt}
						data-preview={image.previewUrl}
					>
						<img
							data-image-fallback
							data-fallback-label={m.coverMissing}
							src={image.preview}
							alt={image.alt}
							width={image.width}
							height={image.height}
							srcSet={image.srcSet}
							sizes="(max-width: 700px) 100vw, 32rem"
							loading={index === 0 ? "eager" : "lazy"}
						/>
					</a>
				</li>
			))}
		</ol>
	</section>
);
