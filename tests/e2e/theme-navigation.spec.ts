import { expect, test } from "@playwright/test";

test("theme follows the device until changed and remembers the choice", async ({
	page,
}) => {
	await page.emulateMedia({ colorScheme: "dark" });
	await page.goto("/");
	await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
	await expect(page.locator("html")).toHaveCSS(
		"background-color",
		"rgb(25, 27, 25)",
	);
	await page.getByRole("button", { name: /Teema/ }).click();
	await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
	await page.reload();
	await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
	await page.getByRole("button", { name: /Teema/ }).click();
	await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
	await page.emulateMedia({ colorScheme: "light" });
	await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
	await page.getByRole("button", { name: /Teema/ }).click();
	await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
});

test("the first toggle switches away from the light device setting", async ({
	page,
}) => {
	await page.emulateMedia({ colorScheme: "light" });
	await page.goto("/");
	await page.getByRole("button", { name: /Teema/ }).click();
	await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
});

test("mobile menu exposes navigation and theme controls", async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 700 });
	await page.goto("/");
	await expect(page.getByRole("link", { name: "Arkisto" })).toBeHidden();
	await page.locator("summary").filter({ hasText: "Valikko" }).click();
	await expect(page.getByRole("link", { name: "Arkisto" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Tietoa" })).toBeVisible();
	await expect(page.getByRole("button", { name: /Teema/ })).toBeVisible();
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
});
