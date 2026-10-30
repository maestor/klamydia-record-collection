export const isMediaPath = (url: unknown): url is string =>
	typeof url === "string" && /^\/media\/[a-f0-9]{64}\.jpg$/.test(url);

export function previewDimensions(
	width: number | null,
	height: number | null,
): { width?: number; height?: number } {
	if (!width || !height) return {};
	const scale = Math.min(1, 640 / Math.max(width, height));
	return {
		width: Math.round(width * scale),
		height: Math.round(height * scale),
	};
}
