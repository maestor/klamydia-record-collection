import { access } from "node:fs/promises";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createClient } from "@libsql/client";
import { createApp } from "./app.js";
import { environment } from "./env.js";
import { r2Reader } from "./r2-reader.js";

const { databaseUrl, port, siteUrl } = environment(process.env);
await access(databaseUrl.slice(5));
const db = createClient({ url: databaseUrl });
await db.execute("PRAGMA query_only = ON");
const media = r2Reader(process.env);
const app = createApp(db, siteUrl, media);
app.get(
	"/assets/*",
	serveStatic({
		root: "./public",
		onFound: (_path, c) => {
			c.header("Cache-Control", "public, max-age=31536000, immutable");
		},
	}),
);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) =>
	console.log(`Listening on http://localhost:${info.port}`),
);
