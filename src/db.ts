import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Client } from "@libsql/client";

async function readMigrations(directory: string) {
	const names = (await readdir(directory))
		.filter((name) => /^\d+_[a-z0-9_-]+\.sql$/.test(name))
		.sort();
	return Promise.all(
		names.map(async (name) => {
			const sql = await readFile(join(directory, name), "utf8");
			return {
				name,
				sql,
				checksum: createHash("sha256").update(sql).digest("hex"),
			};
		}),
	);
}

export async function getPendingMigrationNames(
	db: Client,
	directory = "migrations",
) {
	const migrations = await readMigrations(directory);
	const table = await db.execute(
		"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
	);
	const applied = new Map(
		table.rows.length
			? (
					await db.execute("SELECT name, checksum FROM schema_migrations")
				).rows.map((row) => [String(row.name), String(row.checksum)])
			: [],
	);
	return migrations
		.filter((migration) => {
			if (!applied.has(migration.name)) return true;
			if (applied.get(migration.name) !== migration.checksum)
				throw new Error(`Applied migration has changed: ${migration.name}`);
			return false;
		})
		.map((migration) => migration.name);
}

export async function migrate(db: Client, directory = "migrations") {
	const migrations = await readMigrations(directory);
	const transaction = await db.transaction("write");
	try {
		await transaction.execute(
			"CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)",
		);
		for (const migration of migrations) {
			const applied = (
				await transaction.execute({
					sql: "SELECT checksum FROM schema_migrations WHERE name = ?",
					args: [migration.name],
				})
			).rows[0];
			if (applied) {
				if (applied.checksum !== migration.checksum)
					throw new Error(`Applied migration has changed: ${migration.name}`);
				continue;
			}
			await transaction.executeMultiple(migration.sql);
			await transaction.execute({
				sql: "INSERT INTO schema_migrations VALUES (?, ?, ?)",
				args: [migration.name, migration.checksum, new Date().toISOString()],
			});
		}
		await transaction.commit();
	} finally {
		transaction.close();
	}
}
