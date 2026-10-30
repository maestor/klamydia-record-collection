export function localDatabaseUrl(databaseUrl: string) {
	if (
		!databaseUrl.startsWith("file:") ||
		databaseUrl === "file:" ||
		databaseUrl.includes("?") ||
		databaseUrl.includes("#") ||
		databaseUrl === "file::memory:"
	)
		throw new Error(
			"DATABASE_URL must be a local file: URL without query parameters",
		);
	return databaseUrl;
}

export function databaseEnvironment(env: NodeJS.ProcessEnv) {
	const url = env.DATABASE_URL ?? "file:.data/collection.db";
	if (url.startsWith("file:")) {
		if (env.VERCEL === "1")
			throw new Error("Vercel requires a remote Turso DATABASE_URL");
		return { url: localDatabaseUrl(url), authToken: undefined };
	}
	const remote = new URL(url);
	if (
		remote.protocol !== "libsql:" ||
		!remote.hostname ||
		remote.username ||
		remote.password ||
		(remote.pathname !== "" && remote.pathname !== "/") ||
		remote.search ||
		remote.hash
	)
		throw new Error("DATABASE_URL must be a file: URL or a libsql:// origin");
	if (!env.DATABASE_AUTH_TOKEN?.trim())
		throw new Error("DATABASE_AUTH_TOKEN is required for Turso");
	return { url, authToken: env.DATABASE_AUTH_TOKEN };
}

export function environment(env: NodeJS.ProcessEnv) {
	const { url: databaseUrl, authToken: databaseAuthToken } =
		databaseEnvironment(env);
	const port = Number(env.PORT ?? 3000);
	if (!Number.isInteger(port) || port < 1 || port > 65535)
		throw new Error("PORT must be an integer between 1 and 65535");
	if (env.VERCEL === "1" && !env.SITE_URL)
		throw new Error("SITE_URL is required on Vercel");
	const site = new URL(env.SITE_URL ?? `http://localhost:${port}`);
	if (
		!["http:", "https:"].includes(site.protocol) ||
		site.username ||
		site.password ||
		site.pathname !== "/" ||
		site.search ||
		site.hash
	)
		throw new Error("SITE_URL must be an HTTP(S) origin");
	return { databaseUrl, databaseAuthToken, port, siteUrl: site.origin };
}
