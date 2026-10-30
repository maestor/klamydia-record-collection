import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import sharp from "sharp";
import { expect, it, vi } from "vitest";
import { putImmutable, verifyObject } from "../scripts/r2-store.js";
import { migrate } from "../src/db.js";

vi.mock("@libsql/client", async (importOriginal) => {
	const original = await importOriginal<typeof import("@libsql/client")>();
	return { ...original, createClient: vi.fn(original.createClient) };
});
vi.mock("../scripts/r2-store.js", () => ({
	putImmutable: vi.fn(async () => {}),
	verifyObject: vi.fn(async () => {}),
}));

it("runs manual Turso imports and dry runs using the configured authenticated client", async () => {
	const directory = await mkdtemp(join(tmpdir(), "collection-import-command-"));
	const original =
		await vi.importActual<typeof import("@libsql/client")>("@libsql/client");
	const url = `file:${join(directory, "collection.db")}`;
	const db = original.createClient({ url });
	const args = process.argv;
	const previousExitCode = process.exitCode;
	const logs = vi.spyOn(console, "log").mockImplementation(() => {});
	const errors = vi.spyOn(console, "error").mockImplementation(() => {});
	try {
		await migrate(db);
		// Replace only the remote client boundary; persist the real importer SQL.
		vi.mocked(createClient).mockImplementation((config) =>
			original.createClient({ ...config, url }),
		);
		for (const [name, value] of Object.entries({
			DATABASE_URL: "libsql://collection.turso.io",
			DATABASE_AUTH_TOKEN: "database-write-test-token",
			INSTAGRAM_ACCOUNT_ID: "123",
			INSTAGRAM_ACCESS_TOKEN: "instagram-test-token",
			R2_ENDPOINT: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`,
			R2_BUCKET: "collection",
			R2_ACCESS_KEY_ID: "write-id",
			R2_SECRET_ACCESS_KEY: "write-secret",
			R2_READ_ACCESS_KEY_ID: "read-id",
			R2_READ_SECRET_ACCESS_KEY: "read-secret",
		}))
			vi.stubEnv(name, value);
		const jpeg = await sharp({
			create: { width: 4, height: 4, channels: 3, background: "red" },
		})
			.jpeg()
			.toBuffer();
		vi.stubGlobal("fetch", async (input: string | URL | Request) =>
			new URL(String(input)).hostname === "graph.facebook.com"
				? Response.json({
						data: [
							{
								id: "1",
								timestamp: "2024-01-01T00:00:00+0000",
								media_type: "IMAGE",
								caption: "Imported record",
								permalink: "https://www.instagram.com/p/record/",
								media_url: "https://images.fbcdn.net/record",
							},
						],
					})
				: new Response(jpeg),
		);
		process.exitCode = undefined;
		process.argv = [process.execPath, "scripts/import-instagram.ts", "--full"];
		await import("../scripts/import-instagram.js");
		expect(errors).not.toHaveBeenCalled();
		expect(process.exitCode).toBeUndefined();
		expect(logs).toHaveBeenCalledWith(
			"Database: libsql://collection.turso.io; mode: import",
		);
		expect(createClient).toHaveBeenCalledWith({
			url: "libsql://collection.turso.io",
			authToken: "database-write-test-token",
		});
		expect((await db.execute("SELECT title FROM posts")).rows).toEqual([
			{ title: "Imported record" },
		]);
		expect((await db.execute("SELECT status FROM import_runs")).rows).toEqual([
			{ status: "success" },
		]);
		expect(putImmutable).toHaveBeenCalledTimes(2);
		expect(verifyObject).toHaveBeenCalledTimes(2);
		expect(logs.mock.calls.flat().join(" ")).not.toContain(
			"database-write-test-token",
		);
		await db.execute("UPDATE posts SET title = 'Owner title'");
		vi.clearAllMocks();
		vi.resetModules();
		await import("../scripts/import-instagram.js");
		expect(errors).not.toHaveBeenCalled();
		expect((await db.execute("SELECT title FROM posts")).rows).toEqual([
			{ title: "Owner title" },
		]);
		expect((await db.execute("SELECT status FROM import_runs")).rows).toEqual([
			{ status: "success" },
			{ status: "success" },
		]);
		expect(logs).toHaveBeenCalledWith(
			JSON.stringify({
				created: 0,
				updated: 0,
				unchanged: 1,
				total: 1,
				dryRun: false,
			}),
		);
		vi.clearAllMocks();
		vi.resetModules();
		// A dry run needs neither R2 write nor read credentials and records no run.
		vi.stubEnv("R2_ACCESS_KEY_ID", "");
		vi.stubEnv("R2_SECRET_ACCESS_KEY", "");
		vi.stubEnv("R2_READ_ACCESS_KEY_ID", "");
		vi.stubEnv("R2_READ_SECRET_ACCESS_KEY", "");
		process.argv = [
			process.execPath,
			"scripts/import-instagram.ts",
			"--dry-run",
			"--full",
		];
		await import("../scripts/import-instagram.js");
		expect(errors).not.toHaveBeenCalled();
		expect(putImmutable).not.toHaveBeenCalled();
		expect(verifyObject).not.toHaveBeenCalled();
		expect((await db.execute("SELECT title FROM posts")).rows).toEqual([
			{ title: "Owner title" },
		]);
		expect(
			(await db.execute("SELECT status FROM import_runs")).rows,
		).toHaveLength(2);
		expect(logs).toHaveBeenCalledWith(
			JSON.stringify({
				created: 0,
				updated: 0,
				unchanged: 1,
				total: 1,
				dryRun: true,
			}),
		);
		vi.clearAllMocks();
		vi.resetModules();
		vi.stubEnv("DATABASE_URL", url);
		await import("../scripts/import-instagram.js");
		expect(errors).not.toHaveBeenCalled();
		expect(createClient).toHaveBeenCalledWith({ url, authToken: undefined });
		expect(logs).toHaveBeenCalledWith(`Database: ${url}; mode: dry run`);
		expect(
			(await db.execute("SELECT status FROM import_runs")).rows,
		).toHaveLength(2);
	} finally {
		process.argv = args;
		process.exitCode = previousExitCode;
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		db.close();
		await rm(directory, { recursive: true, force: true });
	}
});

it("rejects missing database settings before opening a client", async () => {
	vi.resetModules();
	vi.clearAllMocks();
	const args = process.argv;
	const previousExitCode = process.exitCode;
	const errors = vi.spyOn(console, "error").mockImplementation(() => {});
	try {
		process.argv = [
			process.execPath,
			"scripts/import-instagram.ts",
			"--dry-run",
		];
		for (const [url, message] of [
			[
				undefined,
				"Set DATABASE_URL to a migrated SQLite or Turso database; see docs/instagram-access.md.",
			],
			[
				"libsql://collection.turso.io",
				"DATABASE_AUTH_TOKEN is required for Turso",
			],
		]) {
			vi.resetModules();
			vi.clearAllMocks();
			vi.stubEnv("DATABASE_URL", url);
			vi.stubEnv("DATABASE_AUTH_TOKEN", "");
			process.exitCode = undefined;
			await import("../scripts/import-instagram.js");
			expect(process.exitCode).toBe(1);
			expect(errors).toHaveBeenCalledWith(message);
			expect(createClient).not.toHaveBeenCalled();
		}
	} finally {
		process.argv = args;
		process.exitCode = previousExitCode;
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	}
});
