import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

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
	await page.screenshot({
		path: "/tmp/klamydia-foundation.png",
		fullPage: true,
	});
});
