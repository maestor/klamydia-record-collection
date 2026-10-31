import { describe, expect, it } from "vitest";
import { environment, localDatabaseUrl } from "../src/env.js";

describe("local configuration", () => {
	it("uses local defaults and accepts an explicit local database and port", () => {
		expect(environment({})).toEqual({
			databaseUrl: "file:.data/collection.db",
			databaseAuthToken: undefined,
			port: 3000,
			siteUrl: "http://localhost:3000",
		});
		expect(
			environment({ DATABASE_URL: "file:/tmp/demo.db", PORT: "3107" }),
		).toEqual({
			databaseUrl: "file:/tmp/demo.db",
			databaseAuthToken: undefined,
			port: 3107,
			siteUrl: "http://localhost:3107",
		});
	});
	it("accepts authenticated Turso connections", () => {
		expect(
			environment({
				DATABASE_URL: "libsql://collection.turso.io",
				DATABASE_AUTH_TOKEN: "test-token",
				SITE_URL: "https://collection.example",
			}),
		).toMatchObject({
			databaseUrl: "libsql://collection.turso.io",
			databaseAuthToken: "test-token",
			siteUrl: "https://collection.example",
		});
	});
	it("rejects unauthenticated or ambiguous database targets and invalid ports", () => {
		for (const DATABASE_URL of [
			"file:demo.db?mode=rw",
			"file::memory:",
			"file:",
			"file:demo.db#fragment",
			"https://example.com",
			"libsql://user:pass@example.com",
			"libsql://example.com/path",
			"libsql://example.com?authToken=secret",
			"libsql://example.com#fragment",
			"libsql://",
		])
			expect(() =>
				environment({ DATABASE_URL, DATABASE_AUTH_TOKEN: "test-token" }),
			).toThrow();
		for (const DATABASE_AUTH_TOKEN of [undefined, "", " "])
			expect(() =>
				environment({
					DATABASE_URL: "libsql://collection.turso.io",
					DATABASE_AUTH_TOKEN,
				}),
			).toThrow(/DATABASE_AUTH_TOKEN/);
		expect(() => localDatabaseUrl("libsql://collection.turso.io")).toThrow();
		for (const SITE_URL of [
			"https://example.com/path",
			"ftp://example.com",
			"https://user:pass@example.com",
		])
			expect(() => environment({ SITE_URL })).toThrow();
		for (const PORT of ["0", "65536", "abc", "1.5"])
			expect(() => environment({ PORT })).toThrow();
	});
	it("requires a remote database and canonical origin on Vercel", () => {
		expect(() => environment({ VERCEL: "1" })).toThrow();
		expect(() =>
			environment({
				VERCEL: "1",
				DATABASE_URL: "libsql://collection.turso.io",
				DATABASE_AUTH_TOKEN: "test-token",
			}),
		).toThrow();
	});
});
