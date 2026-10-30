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
if (
	process.env.R2_MEDIA_MODE &&
	!["local", "r2"].includes(process.env.R2_MEDIA_MODE)
)
	throw new Error("R2_MEDIA_MODE must be local or r2.");
const media =
	process.env.R2_MEDIA_MODE === "r2" ? r2Reader(process.env) : undefined;
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
if (!media) app.get("/media/*", serveStatic({ root: "./.data" }));
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) =>
	console.log(`Listening on http://localhost:${info.port}`),
);
