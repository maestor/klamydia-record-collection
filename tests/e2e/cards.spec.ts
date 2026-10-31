import { expect, test } from "@playwright/test";
import { messages as m } from "../../src/i18n/fi.js";

test("a visitor can still open a post when its cover image fails", async ({
	page,
}) => {
	await page.route("**/media/**", (route) => route.abort());
	await page.goto("/");
	const card = page.getByRole("link", { name: "Esimerkkijulkaisu 27" });
	await expect(card.locator("img")).toHaveCount(0);
	await expect(card.getByText(m.coverMissing)).toBeVisible();
	await card.click();
	await expect(page).toHaveURL(/posts\/esimerkki-27$/);
});

test("below-the-fold covers load when a visitor scrolls to them", async ({
	page,
}) => {
	await page.goto("/archive");
	const image = page.locator(".post-card img").last();
	await image.scrollIntoViewIfNeeded();
	await expect
		.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
		.toBeGreaterThan(0);
});

test("card details overlay the artwork and cards stack on small phones", async ({
	browser,
}) => {
	for (const width of [390, 768]) {
		const context = await browser.newContext({
			viewport: { width, height: 900 },
		});
		try {
			const page = await context.newPage();
			await page.goto("/");
			const cards = page.locator(".post-card");
			const first = await cards.nth(0).boundingBox();
			const second = await cards.nth(1).boundingBox();
			const artwork = await cards.nth(0).locator(".artwork").boundingBox();
			const title = await cards.nth(0).getByRole("heading").boundingBox();
			const date = await cards.nth(0).locator("time").boundingBox();
			if (!first || !second || !artwork || !title || !date)
				throw new Error("Card layout not visible");
			expect(title.y + title.height).toBeLessThanOrEqual(
				artwork.y + artwork.height,
			);
			expect(date.y).toBeGreaterThanOrEqual(artwork.y);
			expect(date.y + date.height).toBeLessThan(title.y);
			if (width === 390)
				expect(second.y).toBeGreaterThan(first.y + first.height - 1);
			else expect(second.y).toBe(first.y);
			await page.goto("/archive?page=3");
			const multi = page
				.locator(".post-card")
				.filter({ hasText: m.imageCount(2) });
			const dateBox = await multi.locator("time").boundingBox();
			const countBox = await multi.getByText(m.imageCount(2)).boundingBox();
			if (!dateBox || !countBox) throw new Error("Card metadata not visible");
			expect(countBox.x).toBeGreaterThan(dateBox.x + dateBox.width);
			expect(countBox.y).toBe(dateBox.y);
		} finally {
			await context.close();
		}
	}
});
