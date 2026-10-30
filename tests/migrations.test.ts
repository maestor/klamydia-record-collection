import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { expect, it } from "vitest";
import { migrate } from "../src/db.js";

it("adopts an existing collection and applies later migrations only once", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		// Existing installations predate the migration ledger.
		for (const name of [
			"001_initial.sql",
			"002_instagram.sql",
			"003_instagram_details.sql",
			"004_image_editorial.sql",
		])
			await db.executeMultiple(await readFile(`migrations/${name}`, "utf8"));
		await db.execute(
			"INSERT INTO posts VALUES ('record', 'Levy', '2026-01-01', 'Kuvaus')",
		);
		await migrate(db);
		await migrate(db);
		expect((await db.execute("SELECT title FROM posts")).rows).toMatchObject([
			{ title: "Levy" },
		]);
		expect(
			(await db.execute("SELECT name FROM schema_migrations")).rows,
		).toHaveLength(4);
	} finally {
		db.close();
	}
});

it("tracks non-repeatable migrations, rejects changed history, and rolls back failures", async () => {
	const directory = await mkdtemp(join(tmpdir(), "collection-migrations-"));
	const db = createClient({ url: "file::memory:" });
	try {
		await writeFile(
			join(directory, "001_test.sql"),
			"CREATE TABLE records (title TEXT);",
		);
		await migrate(db, directory);
		await migrate(db, directory);
		await writeFile(
			join(directory, "002_data.sql"),
			"INSERT INTO records VALUES ('Levy');",
		);
		await migrate(db, directory);
		await migrate(db, directory);
		expect((await db.execute("SELECT * FROM records")).rows).toEqual([
			{ title: "Levy" },
		]);
		await writeFile(
			join(directory, "003_bad.sql"),
			"INSERT INTO records VALUES ('Rollback'); SELECT * FROM missing;",
		);
		await expect(migrate(db, directory)).rejects.toThrow();
		expect((await db.execute("SELECT * FROM records")).rows).toEqual([
			{ title: "Levy" },
		]);
		expect(
			(await db.execute("SELECT name FROM schema_migrations")).rows,
		).toHaveLength(2);
		await rm(join(directory, "003_bad.sql"));
		await writeFile(
			join(directory, "001_test.sql"),
			"CREATE TABLE changed (title TEXT);",
		);
		await expect(migrate(db, directory)).rejects.toThrow(/changed/);
	} finally {
		db.close();
		await rm(directory, { recursive: true, force: true });
	}
});
