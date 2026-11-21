import { inspectInstagram } from "../src/instagram-access.js";

try {
	const result = await inspectInstagram(
		process.env.INSTAGRAM_ACCOUNT_ID ?? "",
		process.env.INSTAGRAM_ACCESS_TOKEN ?? "",
	);
	const summarizePost = (post: NonNullable<typeof result.newest>) => ({
		id: post.id,
		date: post.timestamp,
		type: post.media_type,
		captionCharacters:
			typeof post.caption === "string" ? post.caption.length : 0,
		permalink:
			typeof post.permalink === "string" &&
			/^https:\/\/www\.instagram\.com\//.test(post.permalink)
				? post.permalink
				: undefined,
		mediaAvailable:
			typeof post.media_url === "string" && post.media_url.length > 0,
	});
	console.log(
		JSON.stringify(
			{
				accessiblePosts: result.count,
				types: result.types,
				newest: result.newest && summarizePost(result.newest),
				oldest: result.oldest && summarizePost(result.oldest),
				carousel: result.carousel && {
					...summarizePost(result.carousel),
					children: result.carousel.children.map((child) => ({
						id: child.id,
						type: child.media_type,
						mediaAvailable:
							typeof child.media_url === "string" && child.media_url.length > 0,
					})),
				},
			},
			null,
			2,
		),
	);
} catch (error) {
	console.error(
		error instanceof Error ? error.message : "Instagram access check failed.",
	);
	process.exitCode = 1;
}
