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
		captionCharacters: post.caption?.length ?? 0,
		permalink:
			post.permalink && /^https:\/\/www\.instagram\.com\//.test(post.permalink)
				? post.permalink
				: undefined,
		mediaAvailable: Boolean(post.media_url),
	});
	console.log(
		JSON.stringify(
			{
				accessiblePosts: result.count,
				newest: result.newest && summarizePost(result.newest),
				oldest: result.oldest && summarizePost(result.oldest),
				carousel: result.carousel && {
					...summarizePost(result.carousel),
					children: result.carousel.children.map((child) => ({
						id: child.id,
						type: child.media_type,
						mediaAvailable: Boolean(child.media_url),
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
