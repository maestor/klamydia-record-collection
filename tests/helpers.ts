import type { Client } from "@libsql/client";
import { createApp } from "../src/app.js";

export function createTestApp(db: Client, siteUrl = "http://localhost:3000") {
	return createApp(db, siteUrl, {
		endpoint: "https://images.example.test",
		sign: async (filename) => `https://images.example.test/${filename}`,
	});
}
