import { createClient } from "@libsql/client";
import { within } from "@testing-library/dom";
import { expect, it } from "vitest";
import { createEditor, editorOrigin } from "../scripts/discogs-editor.js";
import { migrate } from "../src/db.js";
import { messages as m } from "../src/i18n/fi.js";
import { createTestApp } from "./helpers.js";

it("saves pasted links to the public post and protects edits across open tabs", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		await db.execute(
			"INSERT INTO posts VALUES ('demo','Levy','2026-01-01','Teksti')",
		);
		const editor = createEditor({ production: () => db, local: () => db });
		const host = new URL(editorOrigin).host;
		const read = (path: string) =>
			editor.request(editorOrigin + path, { headers: { host } });
		const save = (links: string, previous = "[]", origin = editorOrigin) =>
			editor.request(`${editorOrigin}/production/posts/demo`, {
				method: "POST",
				headers: { host, origin },
				body: new URLSearchParams({ links, previous, name: "" }),
			});
		expect(await (await read("/production")).text()).toContain("/posts/demo");
		const first = "https://www.discogs.com/release/11",
			second = "https://www.discogs.com/release/22";
		expect((await save(first, "", "https://other.test")).status).toBe(403);
		expect((await save(`${first}\n${second}\n${first}`)).status).toBe(303);
		expect((await save("", "[]")).status).toBe(409);
		expect((await save("https://example.org/release/11", "11,22")).status).toBe(
			400,
		);
		const publicPost = await (
			await createTestApp(db).request("/posts/demo")
		).text();
		expect(publicPost).toContain(first);
		expect(publicPost).toContain(second);
		expect(
			(
				await save(
					second,
					JSON.stringify([
						{ id: 11, name: "" },
						{ id: 22, name: "" },
					]),
				)
			).status,
		).toBe(303);
		expect(
			(await save("", JSON.stringify([{ id: 22, name: "" }]))).status,
		).toBe(303);
		expect(await (await read("/production/posts/demo")).text()).not.toContain(
			second,
		);
	} finally {
		db.close();
	}
});

it("opens production by default and keeps local and production forms independent", async () => {
	const local = createClient({ url: "file::memory:" }),
		production = createClient({ url: "file::memory:" });
	try {
		for (const db of [local, production]) {
			await migrate(db);
			await db.execute(
				"INSERT INTO posts VALUES ('demo','Levy','2026-01-01','Teksti')",
			);
		}
		const editor = createEditor({
			local: () => local,
			production: () => production,
		});
		const headers = { host: new URL(editorOrigin).host, origin: editorOrigin };
		const read = (path: string) =>
			editor.request(editorOrigin + path, { headers });
		expect((await read("/")).headers.get("location")).toBe("/production");
		for (const mode of ["local", "production"]) {
			const page = await (await read(`/${mode}/posts/demo`)).text();
			expect(page).toContain(`action="/${mode}/posts/demo"`);
		}
		for (const [mode, id] of [
			["local", "11"],
			["production", "22"],
		]) {
			expect(
				(
					await editor.request(`${editorOrigin}/${mode}/posts/demo`, {
						headers,
						method: "POST",
						body: new URLSearchParams({
							previous: "[]",
							name: "",
							links: `https://www.discogs.com/release/${id}`,
						}),
					})
				).status,
			).toBe(303);
		}
		expect(
			(await local.execute("SELECT release_id FROM post_discogs_releases"))
				.rows[0].release_id,
		).toBe(11);
		expect(
			(await production.execute("SELECT release_id FROM post_discogs_releases"))
				.rows[0].release_id,
		).toBe(22);
	} finally {
		local.close();
		production.close();
	}
});

it("publishes the owner's release names in order after the original Instagram link", async () => {
	const db = createClient({ url: "file::memory:" });
	try {
		await migrate(db);
		await db.execute(
			"INSERT INTO posts VALUES ('demo','Albumi','2026-01-01','Teksti')",
		);
		await db.execute(
			"INSERT INTO instagram_posts VALUES ('123','demo','https://www.instagram.com/p/test/','x','IMAGE','2026-01-01')",
		);
		const editor = createEditor({ production: () => db, local: () => db });
		const body = new URLSearchParams({ previous: "[]" });
		for (const [id, name] of [
			["11", "Ensipainos (LP)"],
			["22", ""],
		]) {
			body.append("links", `https://www.discogs.com/release/${id}`);
			body.append("name", name);
		}
		const result = await editor.request(`${editorOrigin}/local/posts/demo`, {
			method: "POST",
			headers: { host: new URL(editorOrigin).host, origin: editorOrigin },
			body,
		});
		expect(result.status).toBe(303);
		document.documentElement.innerHTML = await (
			await createTestApp(db).request("/posts/demo")
		).text();
		const region = within(document.body).getByRole("region", {
			name: m.elsewhere,
		});
		const links = within(region).getAllByRole("link");
		expect(links.map((link) => link.textContent)).toEqual([
			m.source,
			m.discogsLink("Ensipainos (LP)"),
			m.discogsLink(""),
		]);
		for (const link of links) {
			expect(link.getAttribute("target")).toBe("_blank");
			expect(link.getAttribute("rel")?.split(" ")).toContain("noopener");
		}
	} finally {
		db.close();
	}
});
