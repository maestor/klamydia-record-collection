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
	await gallery.getByRole("button", { name: "Näytä pikkukuvat" }).click();
	const thumbnail = gallery
		.getByRole("group", { name: "Pikkukuvat" })
		.getByRole("button", { name: "Näytä kuva 2 / 2" });
	await thumbnail.click();
	await expect(thumbnail).toBeFocused();
	await expect(thumbnail).toHaveAttribute("aria-pressed", "true");
	await expect(gallery.getByRole("status")).toHaveText("Kuva 2 / 2");
});

test("keeps controls over the artwork and reveals thumbnails only on request", async ({
	page,
}) => {
	for (const width of [390, 1440]) {
		await page.setViewportSize({ width, height: 900 });
		await page.goto("/posts/esimerkki");
		const gallery = page.getByRole("region", { name: "Kuvat" });
		const strip = gallery.getByRole("group", {
			name: "Pikkukuvat",
			includeHidden: true,
		});
		await expect(strip).toBeHidden();
		const toggle = gallery.getByRole("button", { name: "Näytä pikkukuvat" });
		await expect(toggle).toHaveAttribute("aria-expanded", "false");
		const image = await gallery
			.getByRole("link", { name: "Kuvitteellinen levykansi" })
			.boundingBox();
		const galleryBox = await gallery.boundingBox();
		if (!image || !galleryBox) throw new Error("Gallery not visible");
		for (const name of [
			"Edellinen kuva",
			"Seuraava kuva",
			"Suurenna kuva",
			"Näytä pikkukuvat",
		]) {
			const box = await gallery
				.getByRole("button", { name, exact: true })
				.boundingBox();
			if (!box) throw new Error(`${name} not visible`);
			expect(box.y).toBeGreaterThanOrEqual(image.y);
			expect(box.y + box.height).toBeLessThanOrEqual(image.y + image.height);
			expect(box.width).toBeGreaterThanOrEqual(44);
			expect(box.height).toBeGreaterThanOrEqual(44);
		}
		expect(galleryBox.height - image.height).toBeLessThanOrEqual(48);
		const dots = gallery.getByRole("group", { name: "Valitse kuva" });
		const second = dots.getByRole("button", { name: "Näytä kuva 2 / 2" });
		await second.click();
		await expect(second).toHaveAttribute("aria-pressed", "true");
		await expect(gallery.getByRole("status")).toHaveText("Kuva 2 / 2");
		await toggle.focus();
		await page.keyboard.press("Enter");
		await expect(strip).toBeVisible();
		await expect(toggle).toHaveAttribute("aria-expanded", "true");
		await expect(
			strip.getByRole("button", { name: "Näytä kuva 2 / 2" }),
		).toHaveAttribute("aria-pressed", "true");
		await page.keyboard.press("Enter");
		await expect(strip).toBeHidden();
		await expect(toggle).toBeFocused();
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
	}
});

test("opens a larger image with an icon close button and returns focus after Escape", async ({
	page,
}) => {
	await page.goto("/posts/esimerkki");
	const opener = page.getByRole("link", { name: "Kuvitteellinen levykansi" });
	await opener.click();
	const dialog = page.getByRole("dialog", { name: "Suurempi kuva" });
	await expect(dialog).toBeVisible();
	await expect
		.poll(() =>
			dialog
				.getByRole("img")
				.evaluate((img: HTMLImageElement) => img.naturalWidth),
		)
		.toBeGreaterThan(0);
	await expect(dialog.getByRole("button", { name: "Sulje" })).toBeFocused();
	await expect(dialog.getByRole("button", { name: "Sulje" })).toHaveText("");
	await expect(dialog.getByRole("link")).toHaveCount(0);
	await page.keyboard.press("Tab");
	await expect(dialog.getByRole("button", { name: "Sulje" })).toBeFocused();
	await page.keyboard.press("Shift+Tab");
	await expect(dialog.getByRole("button", { name: "Sulje" })).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();
	await expect(opener).toBeFocused();
});

test("the modal close button stays inside the panel while the original image loads", async ({
	page,
}) => {
	await page.goto("/posts/esimerkki");
	const gallery = page.getByRole("region", { name: "Kuvat" });
	const original = await gallery
		.locator(".gallery-image")
		.nth(1)
		.getAttribute("href");
	let release = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route(`**${original}`, async (route) => {
		await gate;
		await route.continue();
	});
	try {
		await gallery.getByRole("button", { name: "Seuraava kuva" }).click();
		await gallery.getByRole("button", { name: "Suurenna kuva" }).click();
		const dialog = page.getByRole("dialog", { name: "Suurempi kuva" });
		const panel = await dialog.boundingBox();
		const close = await dialog
			.getByRole("button", { name: "Sulje" })
			.boundingBox();
		if (!panel || !close) throw new Error("Modal not visible");
		expect(close.y + close.height).toBeLessThanOrEqual(panel.y + panel.height);
		await dialog.getByRole("button", { name: "Sulje" }).click();
		await expect(dialog).toBeHidden();
	} finally {
		release();
	}
});

test("arrow navigation keeps focus on the newly visible image", async ({
	page,
}) => {
	await page.goto("/posts/esimerkki");
	const first = page.getByRole("link", { name: "Kuvitteellinen levykansi" });
	const second = page.getByRole("link", { name: "Kuvitteellinen toinen kuva" });
	await first.focus();
	await page.keyboard.press("ArrowRight");
	await expect(second).toBeFocused();
	await page.keyboard.press("ArrowLeft");
	await expect(first).toBeFocused();
});

test("a twenty-image gallery stays compact and every image remains reachable on a small phone", async ({
	page,
}) => {
	await page.setViewportSize({ width: 320, height: 800 });
	await page.goto("/posts/esimerkki-26");
	const gallery = page.getByRole("region", { name: "Kuvat" });
	await expect(gallery.getByRole("status")).toHaveText("Kuva 1 / 20");
	await gallery.getByRole("button", { name: "Edellinen kuva" }).click();
	await expect(gallery.getByRole("status")).toHaveText("Kuva 20 / 20");
	const dots = gallery.getByRole("group", { name: "Valitse kuva" });
	await expect(dots.getByRole("button")).toHaveCount(20);
	await dots
		.getByRole("button", { name: "Näytä kuva 10 / 20", exact: true })
		.click();
	await expect(gallery.getByRole("status")).toHaveText("Kuva 10 / 20");
	await gallery.getByRole("button", { name: "Näytä pikkukuvat" }).click();
	const strip = gallery.getByRole("group", { name: "Pikkukuvat" });
	await strip.getByRole("button", { name: "Näytä kuva 20 / 20" }).click();
	await expect(gallery.getByRole("status")).toHaveText("Kuva 20 / 20");
	await gallery.getByRole("button", { name: "Näytä pikkukuvat" }).click();
	const frame = await gallery.locator(".gallery-stage").boundingBox();
	const box = await gallery.boundingBox();
	if (!frame || !box) throw new Error("Gallery not visible");
	expect(box.height - frame.height).toBeLessThanOrEqual(80);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
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

test("keeps images reachable and the viewer closable if image loading fails", async ({
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
	await page
		.getByRole("group", { name: "Valitse kuva" })
		.getByRole("button", { name: "Näytä kuva 2 / 2" })
		.click();
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
