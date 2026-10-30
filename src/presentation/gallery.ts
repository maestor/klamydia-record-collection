import { messages as m } from "#i18n/fi";
import type { PostImage } from "#repositories/posts";
import { isMediaPath, previewDimensions } from "./media.js";

export type GalleryImage = {
	url: string;
	preview: string;
	previewUrl?: string;
	alt: string;
	width?: number;
	height?: number;
	srcSet?: string;
};

export function presentGallery(
	images: PostImage[],
	title: string,
): GalleryImage[] {
	const validImages = images.filter((image) => isMediaPath(image.url));
	return validImages.map((image, index) => {
		const previewUrl = isMediaPath(image.preview_url)
			? image.preview_url
			: undefined;
		const preview = previewUrl ?? image.url;
		const width = image.width ?? 0;
		const dimensions = previewDimensions(image.width, image.height);
		const existingAlt = image.alt.trim();
		const alt =
			!existingAlt || /^Julkaisun kuva \d+$/.test(existingAlt)
				? m.galleryAlt(title, index + 1, validImages.length)
				: existingAlt;
		return {
			url: image.url,
			preview,
			previewUrl,
			alt,
			...dimensions,
			srcSet:
				preview !== image.url && dimensions.width && dimensions.width < width
					? `${preview} ${dimensions.width}w, ${image.url} ${width}w`
					: undefined,
		};
	});
}
