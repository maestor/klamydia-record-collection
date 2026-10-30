export function environment(env: NodeJS.ProcessEnv) {
	const databaseUrl = env.DATABASE_URL ?? "file:.data/demo.db";
	if (
		!databaseUrl.startsWith("file:") ||
		databaseUrl.includes("?") ||
		databaseUrl === "file::memory:"
	)
		throw new Error(
			"DATABASE_URL must be a local file: URL without query parameters",
		);
	const port = Number(env.PORT ?? 3000);
	if (!Number.isInteger(port) || port < 1 || port > 65535)
		throw new Error("PORT must be an integer between 1 and 65535");
	return { databaseUrl, port };
}
