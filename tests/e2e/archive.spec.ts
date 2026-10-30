import { expect, test } from "@playwright/test";

test("loads more, opens a post, and restores the accumulated archive", async ({
	page,
}) => {
	await page.goto("/archive");
	await page.getByRole("link", { name: "Näytä lisää" }).click();
	await expect(page).toHaveURL(/\/archive\?page=1&through=2$/);
	await expect(page.locator(".post-card")).toHaveCount(24);
	await expect(
		page.getByRole("link", { name: "Esimerkkijulkaisu 15" }),
	).toBeFocused();
	await expect(page.getByRole("status")).toContainText("Lisätty 12 julkaisua");
	await page.reload();
	await expect(page.locator(".post-card")).toHaveCount(24);
	const target = page.getByRole("link", { name: "Esimerkkijulkaisu 05" });
	await target.scrollIntoViewIfNeeded();
	const before = await page.evaluate(() => scrollY);
	await target.click();
	await expect(page).toHaveURL(/posts\/esimerkki-05\?page=1&through=2/);
	await page.goBack();
	await expect(page.locator(".post-card")).toHaveCount(24);
	await expect
		.poll(() => page.evaluate(() => scrollY))
		.toBeGreaterThan(before - 200);
	await page.getByRole("link", { name: "Näytä lisää" }).click();
	await expect(page.locator(".post-card")).toHaveCount(27);
	await expect(page.getByRole("status")).toContainText(
		"Kaikki julkaisut näytetty",
	);
	await expect(page.getByRole("link", { name: "Näytä lisää" })).toHaveCount(0);
});

test("keeps results and offers retry and normal navigation when loading fails", async ({
	page,
}) => {
	await page.goto("/archive");
	await page.route(
		"**/archive/fragments**",
		(route) => route.fulfill({ status: 503, body: "failure" }),
		{ times: 1 },
	);
	await page.getByRole("link", { name: "Näytä lisää" }).click();
	await expect(page.locator(".post-card")).toHaveCount(12);
	await expect(page.getByRole("status")).toContainText(
		"lataaminen epäonnistui",
	);
	await expect(
		page.getByRole("link", { name: "Avaa seuraava sivu" }),
	).toHaveAttribute("href", "/archive?page=2");
	await page.getByRole("link", { name: "Yritä uudelleen" }).click();
	await expect(page.locator(".post-card")).toHaveCount(24);
});

test("does not send duplicate requests while loading", async ({ page }) => {
	await page.goto("/archive");
	let release = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let requests = 0;
	await page.route("**/archive/fragments**", async (route) => {
		requests++;
		await gate;
		await route.continue();
	});
	const more = page.getByRole("link", { name: "Näytä lisää" });
	await more.click();
	await expect(page.locator("#archive-results")).toHaveAttribute(
		"aria-busy",
		"true",
	);
	await page.locator("#archive-more").evaluate((element: HTMLElement) => {
		element.click();
		element.click();
	});
	release();
	await expect(page.locator(".post-card")).toHaveCount(24);
	expect(requests).toBe(1);
});

test("restores a completed range and position after a history cache miss", async ({
	page,
}) => {
	await page.addInitScript(() => {
		window.addEventListener("unload", () => {});
		window.addEventListener("pageshow", (event) =>
			sessionStorage.setItem("archive-test-persisted", String(event.persisted)),
		);
	});
	await page.goto("/archive?page=1&through=3");
	const target = page.getByRole("link", {
		name: "Esimerkkijulkaisu",
		exact: true,
	});
	await target.scrollIntoViewIfNeeded();
	const before = await page.evaluate(() => scrollY);
	await target.click();
	await page.goBack();
	await expect(page.locator(".post-card")).toHaveCount(27);
	await expect
		.poll(() => page.evaluate(() => scrollY))
		.toBeGreaterThan(before - 150);
	expect(
		await page.evaluate(() => sessionStorage.getItem("archive-test-persisted")),
	).toBe("false");
});

test("restores archive state using the post return link and browser Back between batches", async ({
	page,
}) => {
	await page.goto("/archive");
	await page.getByRole("link", { name: "Näytä lisää" }).click();
	await expect(page.locator(".post-card")).toHaveCount(24);
	await page.goBack();
	await expect(page).toHaveURL(/\/archive$/);
	await expect(page.locator(".post-card")).toHaveCount(12);
	await page.goForward();
	await expect(page).toHaveURL(/through=2/);
	await expect(page.locator(".post-card")).toHaveCount(24);
	const target = page.getByRole("link", { name: "Esimerkkijulkaisu 05" });
	await target.scrollIntoViewIfNeeded();
	const before = await page.evaluate(() => scrollY);
	await target.click();
	await page.getByRole("link", { name: "Takaisin arkistoon" }).click();
	await expect(page.locator(".post-card")).toHaveCount(24);
	await expect
		.poll(() => page.evaluate(() => scrollY))
		.toBeGreaterThan(before - 150);
});

test("shows the end of the archive if the next batch becomes empty", async ({
	page,
}) => {
	await page.goto("/archive");
	await page.route("**/archive/fragments**", (route) =>
		route.fulfill({
			status: 200,
			headers: {
				"content-type": "text/html",
				"X-Archive-Has-More": "false",
				"X-Archive-Count": "0",
			},
			body: "",
		}),
	);
	await page.getByRole("link", { name: "Näytä lisää" }).click();
	await expect(page.getByRole("status")).toHaveText(
		"Kaikki julkaisut näytetty.",
	);
	await expect(page.locator(".post-card")).toHaveCount(12);
});

test("uses the restrictive htmx configuration for archive requests", async ({
	page,
}) => {
	const response = await page.goto("/archive");
	expect(response?.headers()["content-security-policy"]).toContain(
		"connect-src 'self'",
	);
	expect(response?.headers()["content-security-policy"]).not.toContain(
		"unsafe-eval",
	);
	const config = await page.evaluate(() => {
		const htmx = (
			window as unknown as { htmx: { config: Record<string, boolean> } }
		).htmx;
		return {
			allowEval: htmx.config.allowEval,
			allowScriptTags: htmx.config.allowScriptTags,
			includeIndicatorStyles: htmx.config.includeIndicatorStyles,
			historyEnabled: htmx.config.historyEnabled,
			selfRequestsOnly: htmx.config.selfRequestsOnly,
		};
	});
	expect(config).toEqual({
		allowEval: false,
		allowScriptTags: false,
		includeIndicatorStyles: false,
		historyEnabled: false,
		selfRequestsOnly: true,
	});
});

test("loads the next batch when scrolling down without moving keyboard focus", async ({
	browser,
}) => {
	const context = await browser.newContext({
		viewport: { width: 390, height: 700 },
	});
	try {
		const page = await context.newPage();
		await page.goto("/archive");
		const home = page.getByRole("link", { name: "Klamydiakokoelma" });
		await home.focus();
		await page.mouse.wheel(0, 30000);
		await expect(page.locator(".post-card")).toHaveCount(24);
		await expect(page).toHaveURL(/through=2/);
		await expect(home).toBeFocused();
		await expect(page.getByRole("link", { name: "Näytä lisää" })).toHaveCount(
			1,
		);
	} finally {
		await context.close();
	}
});

test("automatic loading stops on error until the visitor retries", async ({
	page,
}) => {
	await page.goto("/archive");
	let requests = 0;
	await page.route("**/archive/fragments**", (route) => {
		requests++;
		return requests === 1
			? route.fulfill({ status: 503, body: "failure" })
			: route.continue();
	});
	await page.mouse.wheel(0, 30000);
	await expect(
		page.getByRole("link", { name: "Yritä uudelleen" }),
	).toBeVisible();
	await page.mouse.wheel(0, -300);
	await page.mouse.wheel(0, 300);
	await page.waitForTimeout(300);
	expect(requests).toBe(1);
	await page.getByRole("link", { name: "Yritä uudelleen" }).click();
	await expect(page.locator(".post-card")).toHaveCount(24);
});

test("automatic loading stops at the bounded range and leaves a normal continuation", async ({
	browser,
}) => {
	const context = await browser.newContext({
		viewport: { width: 390, height: 700 },
	});
	try {
		const page = await context.newPage();
		await page.goto("/archive");
		await page.route("**/archive/fragments**", (route) => {
			const batch = Number(
				new URL(route.request().url()).searchParams.get("page"),
			);
			const items = Array.from(
				{ length: 12 },
				(_, index) =>
					`<li><article class="post-card"><a class="post-card-link" href="/posts/demo-${batch}-${index}"><div class="artwork"></div><div class="post-card-details"><h2>Levy ${batch}-${index}</h2></div></a></article></li>`,
			).join("");
			return route.fulfill({
				status: 200,
				headers: {
					"content-type": "text/html",
					"X-Archive-Has-More": "true",
					"X-Archive-Count": "12",
				},
				body: items,
			});
		});
		for (let batch = 2; batch <= 20; batch++) {
			await page.mouse.wheel(0, 1000000);
			await expect(page.locator(".post-card")).toHaveCount(batch * 12);
		}
		const next = page.getByRole("link", { name: "Seuraavat julkaisut" });
		await expect(next).toHaveAttribute("href", "/archive?page=21");
		await page.mouse.wheel(0, 1000000);
		await page.waitForTimeout(300);
		await expect(page.locator(".post-card")).toHaveCount(240);
		await next.click();
		await expect(page).toHaveURL(/page=21$/);
	} finally {
		await context.close();
	}
});

test("a downward touch scroll loads more on a phone", async ({ browser }) => {
	const context = await browser.newContext({
		viewport: { width: 390, height: 700 },
		hasTouch: true,
		isMobile: true,
	});
	try {
		const page = await context.newPage();
		await page.goto("/archive");
		await page
			.getByRole("link", { name: "Näytä lisää" })
			.scrollIntoViewIfNeeded();
		const session = await context.newCDPSession(page);
		await session.send("Input.dispatchTouchEvent", {
			type: "touchStart",
			touchPoints: [{ x: 200, y: 580 }],
		});
		await session.send("Input.dispatchTouchEvent", {
			type: "touchMove",
			touchPoints: [{ x: 200, y: 300 }],
		});
		await session.send("Input.dispatchTouchEvent", {
			type: "touchEnd",
			touchPoints: [],
		});
		await expect(page.locator(".post-card")).toHaveCount(24);
	} finally {
		await context.close();
	}
});

test("keeps archive progress available to assistive technology without showing pagination to scrolling visitors", async ({
	browser,
}) => {
	const context = await browser.newContext({
		viewport: { width: 390, height: 700 },
	});
	try {
		const page = await context.newPage();
		await page.goto("/archive?page=1&through=3");
		const status = page.getByRole("status");
		await expect(status).toHaveText(/Sivut 1–3/);
		expect(
			await status.evaluate((el) => el.getBoundingClientRect().width),
		).toBeLessThanOrEqual(1);
		await expect(page.locator("#archive-page-label")).toBeHidden();
		await expect(
			page.getByRole("navigation", {
				name: "Arkiston sivut",
				includeHidden: true,
			}),
		).toBeHidden();
		await expect(
			page.getByText("Kaikki julkaisut näytetty.", { exact: true }),
		).toBeHidden();
	} finally {
		await context.close();
	}
	const noScript = await browser.newContext({ javaScriptEnabled: false });
	try {
		const page = await noScript.newPage();
		await page.goto("/archive?page=3");
		await expect(page.getByText("Sivu 3", { exact: true })).toBeVisible();
		await expect(
			page.getByText("Kaikki julkaisut näytetty.", { exact: true }),
		).toBeVisible();
	} finally {
		await noScript.close();
	}
});
