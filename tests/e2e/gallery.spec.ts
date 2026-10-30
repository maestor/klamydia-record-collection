import { expect, test } from "@playwright/test";

test("browses images in source order with buttons, keyboard and thumbnails", async ({
	page,
}) => {
	await page.goto("/posts/esimerkki");
	const gallery = page.getByRole("region", { name: "Kuvat" });
	await expect(gallery.getByRole("status")).toHaveText("Kuva 1 / 2");
	await expect(
		gallery.getByRole("img", { name: "Kuvitteellinen levykansi" }),
	).toBeVisible();
	await expect(
		gallery.getByRole("img", { name: "Kuvitteellinen toinen kuva" }),
	).toBeHidden();
	const next = gallery.getByRole("button", { name: "Seuraava kuva" });
	await next.focus();
	await page.keyboard.press("Enter");
	await expect(next).toBeFocused();
	await expect(gallery.getByRole("status")).toHaveText("Kuva 2 / 2");
	await expect(
		gallery.getByRole("img", { name: "Kuvitteellinen toinen kuva" }),
	).toBeVisible();
	await page.keyboard.press("ArrowRight");
	await expect(gallery.getByRole("status")).toHaveText("Kuva 1 / 2");
	const thumbnail = gallery.getByRole("button", { name: "Näytä kuva 2 / 2" });
	await thumbnail.click();
	await expect(thumbnail).toBeFocused();
	await expect(thumbnail).toHaveAttribute("aria-pressed", "true");
	await expect(gallery.getByRole("status")).toHaveText("Kuva 2 / 2");
});

test("opens a larger image with a full-size link and returns focus after Escape", async ({
	page,
}) => {
	await page.goto("/posts/esimerkki");
	const opener = page.getByRole("link", { name: "Kuvitteellinen levykansi" });
	await opener.click();
	const dialog = page.getByRole("dialog", { name: "Suurempi kuva" });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole("button", { name: "Sulje" })).toBeFocused();
	await expect(
		dialog.getByRole("link", { name: "Avaa alkuperäinen kuva" }),
	).toHaveAttribute("href", (await opener.getAttribute("href")) ?? "");
	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();
	await expect(opener).toBeFocused();
});

test("one-image posts do not show unnecessary slide controls", async ({
	page,
}) => {
	await page.goto("/posts/esimerkki-27");
	const gallery = page.getByRole("region", { name: "Kuvat" });
	await expect(gallery.getByRole("img")).toBeVisible();
	await expect(
		gallery.getByRole("button", { name: "Seuraava kuva" }),
	).toHaveCount(0);
	await expect(gallery.getByRole("button", { name: /Näytä kuva/ })).toHaveCount(
		0,
	);
	const enlarge = gallery.getByRole("button", { name: "Suurenna kuva" });
	await enlarge.click();
	await expect(
		page.getByRole("dialog", { name: "Suurempi kuva" }),
	).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(enlarge).toBeFocused();
});

test("swipes between images on touch and works with reduced motion", async ({
	browser,
}) => {
	const context = await browser.newContext({
		viewport: { width: 390, height: 700 },
		hasTouch: true,
		isMobile: true,
		reducedMotion: "reduce",
	});
	try {
		const page = await context.newPage();
		await page.goto("/posts/esimerkki");
		const image = page.getByRole("img", { name: "Kuvitteellinen levykansi" });
		await image.scrollIntoViewIfNeeded();
		const box = await image.boundingBox();
		if (!box) throw new Error("Gallery image is not visible");
		const session = await context.newCDPSession(page);
		const y = Math.min(650, Math.max(50, box.y + box.height / 2));
		await session.send("Input.dispatchTouchEvent", {
			type: "touchStart",
			touchPoints: [{ x: 300, y }],
		});
		await session.send("Input.dispatchTouchEvent", {
			type: "touchMove",
			touchPoints: [{ x: 100, y }],
		});
		await session.send("Input.dispatchTouchEvent", {
			type: "touchEnd",
			touchPoints: [],
		});
		await expect(page.getByRole("status")).toHaveText("Kuva 2 / 2");
		await expect(
			page.getByRole("dialog", { name: "Suurempi kuva" }),
		).toHaveCount(0);
	} finally {
		await context.close();
	}
});

test("keeps images reachable and the full-size link available if image loading fails", async ({
	page,
}) => {
	await page.route("**/media/**", (route) => route.abort());
	await page.goto("/posts/esimerkki");
	const gallery = page.getByRole("region", { name: "Kuvat" });
	await expect(
		gallery.getByRole("link", { name: "Kuvaa ei saatavilla" }),
	).toBeVisible();
	await gallery.getByRole("button", { name: "Seuraava kuva" }).click();
	await expect(gallery.getByRole("status")).toHaveText("Kuva 2 / 2");
	await gallery.getByRole("link", { name: "Kuvaa ei saatavilla" }).click();
	const viewer = page.getByRole("dialog", { name: "Suurempi kuva" });
	await expect(viewer.getByText("Kuvaa ei saatavilla")).toBeVisible();
	await expect(
		viewer.getByRole("link", { name: "Avaa alkuperäinen kuva" }),
	).toBeVisible();
	for (let i = 0; i < 3; i++) {
		await page.keyboard.press("Tab");
		expect(
			await viewer.evaluate((dialog) =>
				dialog.contains(document.activeElement),
			),
		).toBe(true);
	}
	await viewer.getByRole("button", { name: "Sulje" }).click();
	await expect(
		gallery.getByRole("link", { name: "Kuvaa ei saatavilla" }),
	).toBeFocused();
});

test("does not duplicate gallery controls after reload or history restoration", async ({
	page,
}) => {
	await page.goto("/posts/esimerkki");
	await page.reload();
	const script = await page
		.locator('script[src*="/gallery-"]')
		.getAttribute("src");
	if (!script) throw new Error("Gallery script is missing");
	await page.addScriptTag({ url: script });
	await expect(page.getByRole("button", { name: "Seuraava kuva" })).toHaveCount(
		1,
	);
	await page.goto("/");
	await page.goBack();
	await expect(page.getByRole("button", { name: "Seuraava kuva" })).toHaveCount(
		1,
	);
	await page.getByRole("button", { name: "Seuraava kuva" }).click();
	await expect(page.getByRole("status")).toHaveText("Kuva 2 / 2");
});

test("loads previews without downloading every original before opening the viewer", async ({
	page,
}) => {
	const requested: string[] = [];
	page.on("request", (request) =>
		requested.push(new URL(request.url()).pathname),
	);
	await page.goto("/posts/esimerkki");
	await page.waitForLoadState("networkidle");
	const links = page.locator(".gallery-slide .gallery-image");
	const secondOriginal = await links.nth(1).getAttribute("href");
	expect(secondOriginal).toBeTruthy();
	expect(requested).not.toContain(secondOriginal);
	await page.getByRole("button", { name: "Näytä kuva 2 / 2" }).click();
	await page.getByRole("link", { name: "Kuvitteellinen toinen kuva" }).click();
	await expect(
		page.getByRole("dialog", { name: "Suurempi kuva" }),
	).toBeVisible();
	await expect.poll(() => requested.includes(secondOriginal ?? "")).toBe(true);
});

test("preserves every full-image link if gallery initialization cannot load", async ({
	page,
}) => {
	await page.route("**/assets/gallery-*.js", (route) => route.abort());
	await page.goto("/posts/esimerkki");
	await expect(
		page.getByRole("link", { name: "Kuvitteellinen levykansi" }),
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: "Kuvitteellinen toinen kuva" }),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Seuraava kuva" })).toHaveCount(
		0,
	);
});

test("a vertical touch gesture keeps the active image and scrolls the page", async ({
	browser,
}) => {
	const context = await browser.newContext({
		viewport: { width: 390, height: 700 },
		hasTouch: true,
		isMobile: true,
	});
	try {
		const page = await context.newPage();
		await page.goto("/posts/esimerkki");
		const image = page.getByRole("img", { name: "Kuvitteellinen levykansi" });
		await image.scrollIntoViewIfNeeded();
		const before = await page.evaluate(() => scrollY);
		const session = await context.newCDPSession(page);
		await session.send("Input.dispatchTouchEvent", {
			type: "touchStart",
			touchPoints: [{ x: 180, y: 580 }],
		});
		await session.send("Input.dispatchTouchEvent", {
			type: "touchMove",
			touchPoints: [{ x: 180, y: 300 }],
		});
		await session.send("Input.dispatchTouchEvent", {
			type: "touchEnd",
			touchPoints: [],
		});
		await expect
			.poll(() => page.evaluate(() => scrollY))
			.toBeGreaterThan(before);
		await expect(page.getByRole("status")).toHaveText("Kuva 1 / 2");
	} finally {
		await context.close();
	}
});

test("keeps a stable gallery frame for portrait and landscape images", async ({
	page,
}) => {
	await page.goto("/posts/esimerkki");
	const gallery = page.getByRole("region", { name: "Kuvat" });
	const first = await gallery
		.getByRole("link", { name: "Kuvitteellinen levykansi" })
		.boundingBox();
	await gallery.getByRole("button", { name: "Seuraava kuva" }).click();
	const second = await gallery
		.getByRole("link", { name: "Kuvitteellinen toinen kuva" })
		.boundingBox();
	if (!first || !second) throw new Error("Gallery frames not visible");
	expect(second.width).toBe(first.width);
	expect(second.height).toBe(first.height);
	expect(
		await gallery
			.getByRole("img", { name: "Kuvitteellinen toinen kuva" })
			.evaluate((image) => getComputedStyle(image).objectFit),
	).toBe("contain");
});
