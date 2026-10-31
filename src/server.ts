import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createRuntime } from "./runtime.js";

const { app, port } = await createRuntime(process.env);
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
