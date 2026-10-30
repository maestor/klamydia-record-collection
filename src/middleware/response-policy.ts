import { createMiddleware } from "hono/factory";

export function responsePolicy(mediaEndpoint: string) {
	return createMiddleware(async (c, next) => {
		await next();
		c.header(
			"Content-Security-Policy",
			`default-src 'none'; img-src 'self' ${mediaEndpoint}; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
		);
		c.header("X-Content-Type-Options", "nosniff");
		c.header("Referrer-Policy", "strict-origin-when-cross-origin");
		c.header(
			"Cache-Control",
			c.res.status !== 200
				? "no-store"
				: c.req.path.startsWith("/assets/")
					? "public, max-age=31536000, immutable"
					: "public, max-age=0, s-maxage=300, stale-while-revalidate=60",
		);
	});
}
