export function renderSitemap(urls: string[]) {
	return `<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/css" href="/assets/sitemap-6cef9e89.css"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${url.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</loc></url>`).join("")}</urlset>`;
}
