import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("the About page is reachable by keyboard and readable without scripts", async ({
	browser,
}) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	try {
		const page = await context.newPage();
		await page.goto("/");
		await page.keyboard.press("Tab");
		await page.keyboard.press("Tab");
		await page.keyboard.press("Tab");
		await expect(page.getByRole("link", { name: "Tietoa" })).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(page).toHaveURL(/\/about$/);
		await expect(
			page.getByRole("heading", { name: "Tietoa kokoelmasta" }),
		).toBeVisible();
		await expect(
			page.getByRole("img", { name: "Klamydia-kaseteista tehty kello" }),
		).toBeVisible();
		await expect(page.getByText("Kirjoitettu 2.1.2023")).toBeVisible();
		await expect(
			page.getByRole("link", { name: "Seuraa instagramissa" }),
		).toHaveAttribute("href", "https://www.instagram.com/klamydiakokoelma/");
	} finally {
		await context.close();
	}
});

test("About has an accessible responsive layout", async ({ page }) => {
	for (const [width, height] of [
		[390, 844],
		[1440, 900],
	] as const) {
		await page.setViewportSize({ width, height });
		await page.goto("/about");
		await expect(
			page.getByRole("heading", { name: "Tietoa kokoelmasta" }),
		).toBeVisible();
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
		expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
	}
});
