import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { type Client, type Config, createClient } from "@libsql/client";

export async function createDatabaseBackup(
	config: Config,
	directory = ".data/backups",
) {
	if (!config.url.startsWith("libsql://") || !config.authToken)
		throw new Error(
			"db:backup requires a remote Turso URL and DATABASE_AUTH_TOKEN",
		);
	await mkdir(directory, { recursive: true });
	const work = await mkdtemp(join(tmpdir(), "collection-backup-"));
	const destination = resolve(
		directory,
		`turso-backup-${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}.db`,
	);
	let replica: Client | undefined;
	try {
		replica = createClient({
			url: pathToFileURL(join(work, "replica.db")).href,
			syncUrl: config.url,
			authToken: config.authToken,
		});
		await replica.sync();
		const check = await replica.execute("PRAGMA quick_check");
		if (check.rows[0].quick_check !== "ok")
			throw new Error("Backup replica failed PRAGMA quick_check");
		await replica.execute(`VACUUM INTO '${destination.replaceAll("'", "''")}'`);
		return destination;
	} catch (error) {
		await rm(destination, { force: true });
		throw error;
	} finally {
		replica?.close();
		await rm(work, { recursive: true, force: true });
	}
}
