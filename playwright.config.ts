import { defineConfig } from "@playwright/test";
export default defineConfig({
	testDir: "tests/e2e",
	use: { baseURL: "http://127.0.0.1:3107", headless: true },
	webServer: {
		command: "npm run db:migrate && npm run seed:demo && PORT=3107 npm start",
		url: "http://127.0.0.1:3107/posts/esimerkki",
		reuseExistingServer: false,
		env: { DATABASE_URL: "file:.data/e2e.db" },
	},
});
