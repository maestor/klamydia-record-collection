const revalidatedAssets = new Set([
	"/assets/style.css",
	"/assets/sitemap.css",
	"/assets/archive.js",
	"/assets/images.js",
	"/assets/theme.js",
	"/assets/gallery.js",
]);

export function assetCacheControl(path: string): string {
	return revalidatedAssets.has(path)
		? "public, no-cache, must-revalidate"
		: "public, max-age=31536000, immutable";
}
