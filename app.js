import { Hono } from "hono";
import { createRuntime } from "./dist/runtime.js";

// Vercel's Hono entrypoint uses the compiled modules and native package imports.
const { app: collection } = await createRuntime(process.env);
const app = new Hono();
app.route("/", collection);

export default app;
