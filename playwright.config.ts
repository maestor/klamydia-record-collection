import { defineConfig } from "@playwright/test";
export default defineConfig({
	testDir: "tests/e2e",
	use: { baseURL: "http://127.0.0.1:3107", headless: true },
	webServer: {
		command: "node --conditions=development --import tsx tests/e2e/server.ts",
		url: "http://127.0.0.1:3107/posts/esimerkki",
		reuseExistingServer: false,
	},
});
