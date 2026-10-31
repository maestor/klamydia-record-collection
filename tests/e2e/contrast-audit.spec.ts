import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const scheme of ["light", "dark"] as const) {
	for (const path of ["/", "/archive", "/about", "/posts/esimerkki"]) {
		test(`${scheme} contrast on ${path}`, async ({ page }) => {
			await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
			await page.goto(path);
			if (path === "/") await page.locator(".button").first().hover();
			expect(
				(
					await new AxeBuilder({ page })
						.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
						.analyze()
				).violations,
			).toEqual([]);
		});
	}
	test(`${scheme} mobile menu contrast`, async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 700 });
		await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
		await page.goto("/");
		await page.locator("summary").filter({ hasText: "Valikko" }).click();
		expect(
			(
				await new AxeBuilder({ page })
					.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
					.analyze()
			).violations,
		).toEqual([]);
	});
}
