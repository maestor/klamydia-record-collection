import { access, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { expect, it, vi } from "vitest";
import { createDatabaseBackup } from "../scripts/database-backup.js";
import { migrate } from "../src/db.js";

vi.mock("@libsql/client", async (importOriginal) => {
	const original = await importOriginal<typeof import("@libsql/client")>();
	return { ...original, createClient: vi.fn(original.createClient) };
});

it("creates a readable pre-migration SQLite snapshot and cleans up failed backups", async () => {
	const directory = await mkdtemp(join(tmpdir(), "collection-backup-test-"));
	const original =
		await vi.importActual<typeof import("@libsql/client")>("@libsql/client");
	const sourceUrl = `file:${join(directory, "source.db")}`;
	const source = original.createClient({ url: sourceUrl });
	const config = {
		url: "libsql://collection.turso.io",
		authToken: "test-token",
	};
	try {
		await migrate(source);
		await source.execute(
			"INSERT INTO posts VALUES ('record', 'Levy', '2026-01-01', 'Kuvaus')",
		);
		// Substitute only replica bootstrap; snapshot and integrity checks use real SQLite.
		vi.mocked(createClient).mockImplementation(() => {
			const replica = original.createClient({ url: sourceUrl });
			vi.spyOn(replica, "sync").mockResolvedValue({
				frames_synced: 1,
				frame_no: 1,
			});
			return replica;
		});
		const backups = join(directory, "backups 'quoted'");
		const path = await createDatabaseBackup(config, backups);
		expect(createClient).toHaveBeenCalledWith(
			expect.objectContaining({
				syncUrl: config.url,
				authToken: config.authToken,
			}),
		);
		const snapshot = original.createClient({ url: `file:${path}` });
		try {
			expect((await snapshot.execute("PRAGMA quick_check")).rows).toEqual([
				{ quick_check: "ok" },
			]);
			expect((await snapshot.execute("SELECT title FROM posts")).rows).toEqual([
				{ title: "Levy" },
			]);
			await source.execute("UPDATE posts SET title = 'Changed'");
			expect((await snapshot.execute("SELECT title FROM posts")).rows).toEqual([
				{ title: "Levy" },
			]);
		} finally {
			snapshot.close();
		}
		vi.mocked(createClient).mockImplementation(() => {
			const replica = original.createClient({ url: sourceUrl });
			vi.spyOn(replica, "sync").mockRejectedValue(
				new Error("Replication failed"),
			);
			return replica;
		});
		await expect(createDatabaseBackup(config, backups)).rejects.toThrow(
			"Replication failed",
		);
		const replicaUrl = vi.mocked(createClient).mock.calls.at(-1)?.[0].url;
		expect(replicaUrl).toBeDefined();
		await expect(
			access(dirname(fileURLToPath(String(replicaUrl)))),
		).rejects.toThrow();
		expect(await readdir(backups)).toEqual([path.split("/").at(-1)]);
		await expect(
			createDatabaseBackup({ url: sourceUrl }, backups),
		).rejects.toThrow(/remote/);
		await expect(
			createDatabaseBackup({ url: config.url }, backups),
		).rejects.toThrow(/DATABASE_AUTH_TOKEN/);
		vi.mocked(createClient).mockImplementation(() => {
			throw new Error("Bootstrap failed");
		});
		await expect(createDatabaseBackup(config, backups)).rejects.toThrow(
			"Bootstrap failed",
		);
		vi.mocked(createClient).mockImplementation(() => {
			const replica = original.createClient({ url: sourceUrl });
			vi.spyOn(replica, "sync").mockResolvedValue({
				frames_synced: 1,
				frame_no: 1,
			});
			vi.spyOn(replica, "execute").mockImplementation(() =>
				source.execute("SELECT 'damaged' AS quick_check"),
			);
			return replica;
		});
		await expect(createDatabaseBackup(config, backups)).rejects.toThrow(
			/quick_check/,
		);
		vi.mocked(createClient).mockImplementation(() => {
			const replica = original.createClient({ url: sourceUrl });
			vi.spyOn(replica, "sync").mockResolvedValue({
				frames_synced: 1,
				frame_no: 1,
			});
			vi.spyOn(replica, "execute").mockImplementation(async (stmt) => {
				if (typeof stmt === "string" && stmt.startsWith("VACUUM INTO '")) {
					await writeFile(
						stmt.slice("VACUUM INTO '".length, -1).replaceAll("''", "'"),
						"partial snapshot",
					);
					throw new Error("Snapshot write failed");
				}
				return source.execute(stmt);
			});
			return replica;
		});
		await expect(createDatabaseBackup(config, backups)).rejects.toThrow(
			"Snapshot write failed",
		);
		expect(await readdir(backups)).toEqual([path.split("/").at(-1)]);
	} finally {
		source.close();
		vi.restoreAllMocks();
		await rm(directory, { recursive: true, force: true });
	}
});

it("the backup command reads Turso settings and reports its usable snapshot", async () => {
	const original =
		await vi.importActual<typeof import("@libsql/client")>("@libsql/client");
	const source = original.createClient({ url: "file::memory:" });
	const logs = vi.spyOn(console, "log").mockImplementation(() => {});
	let snapshotPath: string | undefined;
	try {
		await migrate(source);
		await source.execute(
			"INSERT INTO posts VALUES ('command', 'Command backup', '2026-01-01', 'Kuvaus')",
		);
		vi.mocked(createClient).mockImplementation(() => {
			vi.spyOn(source, "sync").mockResolvedValue({
				frames_synced: 1,
				frame_no: 1,
			});
			return source;
		});
		vi.stubEnv("DATABASE_URL", "libsql://collection.turso.io");
		vi.stubEnv("DATABASE_AUTH_TOKEN", "test-token");
		await import("../scripts/backup-database.js");
		snapshotPath = String(logs.mock.calls[0][0]).replace(
			"Created Turso backup at ",
			"",
		);
		const snapshot = original.createClient({ url: `file:${snapshotPath}` });
		try {
			expect((await snapshot.execute("SELECT title FROM posts")).rows).toEqual([
				{ title: "Command backup" },
			]);
		} finally {
			snapshot.close();
		}
	} finally {
		source.close();
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		if (snapshotPath) await rm(snapshotPath, { force: true });
	}
});
