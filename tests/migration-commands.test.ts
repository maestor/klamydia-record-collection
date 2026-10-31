import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { expect, it, vi } from "vitest";
import { migrate } from "../src/db.js";

it("reports pending migrations to Actions and skips a current schema without writing data", async () => {
	const directory = await mkdtemp(
		join(tmpdir(), "collection-pending-command-"),
	);
	const url = `file:${join(directory, "collection.db")}`;
	const output = join(directory, "github-output");
	const db = createClient({ url });
	const logs = vi.spyOn(console, "log").mockImplementation(() => {});
	vi.stubEnv("DATABASE_URL", url);
	vi.stubEnv("DATABASE_AUTH_TOKEN", "");
	vi.stubEnv("GITHUB_OUTPUT", output);
	vi.stubEnv("VERCEL", "0");
	try {
		await import("../scripts/check-pending-migrations.js");
		expect(logs.mock.calls.flat().join(" ")).toContain(
			"Pending migrations (4)",
		);
		expect(await readFile(output, "utf8")).toBe(
			"has_pending=true\npending_count=4\n",
		);
		expect(
			(await db.execute("SELECT name FROM sqlite_master WHERE type = 'table'"))
				.rows,
		).toEqual([]);
		await migrate(db);
		vi.resetModules();
		await import("../scripts/check-pending-migrations.js");
		expect(logs).toHaveBeenCalledWith("No pending migrations.");
		expect(await readFile(output, "utf8")).toContain(
			"has_pending=false\npending_count=0\n",
		);
		vi.resetModules();
		logs.mockClear();
		vi.stubEnv("GITHUB_OUTPUT", "");
		await import("../scripts/check-pending-migrations.js");
		expect(logs).toHaveBeenCalledWith("No pending migrations.");
	} finally {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		db.close();
		await rm(directory, { recursive: true, force: true });
	}
});
