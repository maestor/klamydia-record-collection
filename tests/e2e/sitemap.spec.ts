import { strict as assert } from "node:assert";
import { expect, test } from "@playwright/test";

test("sitemap URLs are readable separately in a browser", async ({ page }) => {
	await page.goto("/sitemap.xml");
	const locations = page.locator("loc");
	await expect(locations.first()).toHaveText("http://127.0.0.1:3107/");
	const first = await locations.nth(0).boundingBox();
	const second = await locations.nth(1).boundingBox();
	assert.ok(first);
	assert.ok(second);
	expect(second.y).toBeGreaterThan(first.y);
});
