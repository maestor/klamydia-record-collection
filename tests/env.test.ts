import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { environment } from "../src/env.js";

describe("local configuration", () => {
	it("uses local defaults and accepts an explicit local database and port", () => {
		expect(environment({})).toEqual({
			databaseUrl: "file:.data/collection.db",
			port: 3000,
			siteUrl: "http://localhost:3000",
		});
		expect(
			environment({ DATABASE_URL: "file:/tmp/demo.db", PORT: "3107" }),
		).toEqual({
			databaseUrl: "file:/tmp/demo.db",
			port: 3107,
			siteUrl: "http://localhost:3107",
		});
	});
	it("rejects remote or ambiguous database targets and invalid ports", () => {
		for (const DATABASE_URL of [
			"libsql://example.com",
			"file:demo.db?mode=rw",
			"file::memory:",
		])
			expect(() => environment({ DATABASE_URL })).toThrow();
		for (const SITE_URL of [
			"https://example.com/path",
			"ftp://example.com",
			"https://user:pass@example.com",
		])
			expect(() => environment({ SITE_URL })).toThrow();
		for (const PORT of ["0", "65536", "abc", "1.5"])
			expect(() => environment({ PORT })).toThrow();
	});
});

it("refuses to seed demo fixtures into the default collection database", () => {
	const result = spawnSync(
		process.execPath,
		["--import", "tsx", "scripts/seed.ts"],
		{
			env: { ...process.env, DATABASE_URL: "file:.data/collection.db" },
			encoding: "utf8",
		},
	);
	expect(result.status).not.toBe(0);
	expect(result.stderr).toContain("demo database");
});
