import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { messages as m } from "../../src/i18n/fi.js";

test("a visitor can read a direct fixture page without JavaScript", async ({
	browser,
}) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	try {
		const page = await context.newPage();
		await page.goto("/posts/esimerkki");
		await expect(
			page.getByRole("heading", { name: "Esimerkkijulkaisu" }),
		).toBeVisible();
		await expect(
			page.getByRole("img", { name: "Kuvitteellinen levykansi" }),
		).toBeVisible();
		await expect(
			page.getByRole("img", { name: "Kuvitteellinen toinen kuva" }),
		).toBeVisible();
		expect(
			await page
				.getByRole("img", { name: "Kuvitteellinen toinen kuva" })
				.evaluate((img: HTMLImageElement) => img.naturalWidth),
		).toBeGreaterThan(0);
		await page.reload();
	} finally {
		await context.close();
	}
});

test("fixture page has no automated accessibility violations", async ({
	page,
}) => {
	await page.goto("/posts/esimerkki");
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("browses pages with keyboard and browser history without scripts", async ({
	browser,
}) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	try {
		const page = await context.newPage();
		await page.goto("/");
		await page.keyboard.press("Tab");
		await expect(
			page.getByRole("link", { name: "Klamydiakokoelma" }),
		).toBeFocused();
		await page.getByRole("link", { name: "Esimerkkijulkaisu 27" }).click();
		await expect(page).toHaveURL(/posts\/esimerkki-27$/);
		await page.reload();
		await page.getByRole("link", { name: m.backArchive }).click();
		await page.getByRole("link", { name: m.loadMore }).click();
		await expect(page).toHaveURL(/page=2/);
		await page.getByRole("link", { name: m.loadMore }).click();
		await expect(page.getByText(m.page(3))).toBeVisible();
		await page.getByRole("link", { name: "Esimerkkijulkaisu 03" }).click();
		await page.getByRole("link", { name: m.backArchive }).click();
		await expect(page.getByText(m.page(3))).toBeVisible();
		await page.goBack();
		await page.goBack();
		await page.goBack();
		await expect(page.getByText(m.page(2))).toBeVisible();
	} finally {
		await context.close();
	}
});

test("the site icon and touch icon load as images", async ({ page }) => {
	await page.goto("/");
	for (const [rel, size] of [
		["icon", 32],
		["apple-touch-icon", 180],
	] as const) {
		const href = await page.locator(`link[rel="${rel}"]`).getAttribute("href");
		expect(href).toBeTruthy();
		const icon = await page.evaluate(async (url) => {
			if (!url) throw new Error("Icon URL missing");
			const image = new Image();
			image.src = url;
			await image.decode();
			return { width: image.naturalWidth, height: image.naturalHeight };
		}, href);
		expect(icon).toEqual({ width: size, height: size });
	}
});
