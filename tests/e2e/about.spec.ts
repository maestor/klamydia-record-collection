import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { formatDate, messages as m } from "../../src/i18n/fi.js";

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
		await expect(page.getByRole("link", { name: m.about })).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(page).toHaveURL(/\/about$/);
		await expect(
			page.getByRole("heading", { name: m.aboutTitle }),
		).toBeVisible();
		await expect(
			page.getByRole("img", { name: m.aboutImageAlt }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", {
				name: m.aboutPostTitle(formatDate("2023-01-02")),
			}),
		).toBeVisible();
		const instagram = page.getByRole("link", { name: m.followInstagram });
		const github = page.getByRole("link", { name: m.siteImplementation });
		await expect(instagram).toHaveAttribute(
			"href",
			"https://www.instagram.com/klamydiakokoelma/",
		);
		await expect(github).toHaveAttribute(
			"href",
			"https://github.com/maestor/klamydia-record-collection",
		);
		await instagram.focus();
		await page.keyboard.press("Tab");
		await expect(github).toBeFocused();
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
			page.getByRole("heading", { name: m.aboutTitle }),
		).toBeVisible();
		const instagramBox = await page
			.getByRole("link", { name: m.followInstagram })
			.boundingBox();
		const githubBox = await page
			.getByRole("link", { name: m.siteImplementation })
			.boundingBox();
		expect(instagramBox).not.toBeNull();
		expect(githubBox).not.toBeNull();
		expect(githubBox?.y).toBe(instagramBox?.y);
		const imageBox = await page
			.getByRole("img", { name: m.aboutImageAlt })
			.boundingBox();
		expect(imageBox).not.toBeNull();
		if (!instagramBox || !githubBox || !imageBox)
			throw new Error("About content missing");
		expect(
			Math.max(
				instagramBox.y + instagramBox.height,
				githubBox.y + githubBox.height,
			),
		).toBeLessThanOrEqual(imageBox.y);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
		expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
	}
});

test("long text flows below the image on wide screens", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto("/about");
	const result = await page.evaluate(() => {
		const image = document.querySelector(".about-image");
		const description = document.querySelector(".about-content .description");
		if (!image || !description) throw new Error("About content missing");
		description.textContent = "Long text for testing the layout. ".repeat(180);
		const text = description.firstChild;
		if (!text) throw new Error("Description missing");
		const range = document.createRange();
		range.selectNodeContents(text);
		const imageBox = image.getBoundingClientRect();
		const lines = Array.from(range.getClientRects());
		return {
			beside: lines.some(
				(line) =>
					line.top < imageBox.bottom &&
					line.left >= imageBox.right &&
					line.width > 250,
			),
			below: lines.some(
				(line) =>
					line.top >= imageBox.bottom &&
					Math.abs(line.left - imageBox.left) < 2,
			),
		};
	});
	expect(result).toEqual({ beside: true, below: true });
});
