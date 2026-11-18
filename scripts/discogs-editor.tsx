import type { Client } from "@libsql/client";
import { Hono } from "hono";
import type { Child } from "hono/jsx";
import {
	ABOUT_MEDIA_ID,
	getDiscogsReleases,
	getPost,
} from "../src/repositories/posts.js";
import { releaseId } from "./discogs-links.js";

export const editorOrigin = "http://127.0.0.1:3218";
const publicOrigin = "https://klamydia-records.vercel.app";
const style = `
:root {color-scheme:light dark;font: 100%/1.55 system-ui,sans-serif}
body {max-width:46rem;margin:0 auto;padding:1rem}
header {border-bottom:1px solid GrayText;padding-block:.6rem}
nav {display:flex;gap:.5rem;margin-block:.5rem} nav a {padding:.35rem .8rem;border:1px solid currentColor;border-radius:.3rem} nav [aria-current] {font-weight:bold;background:CanvasText;color:Canvas}
h1 {line-height:1.2;margin-bottom:.6rem}
form {margin-block:1.5rem}label {display:block;font-weight:650}
textarea,input,button {box-sizing:border-box;font:inherit;padding:.55rem}
textarea {width:100%;margin:.4rem 0}button {cursor:pointer}
fieldset {margin:1rem 0;min-width:0} fieldset input {width:100%}
li {margin-block:.5rem} a {overflow-wrap:anywhere}
`;
const modes = ["production", "local"] as const;
type Mode = (typeof modes)[number];
export type EditorDatabases = Record<Mode, () => Client | Promise<Client>>;
const labels = { production: "Tuotanto", local: "Paikallinen" };

function Page({
	mode,
	title,
	children,
}: {
	mode: Mode;
	title: string;
	children: Child;
}) {
	return (
		<html lang="fi">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width,initial-scale=1" />
				<title>{title} · Klamydiakokoelma</title>
				<style>{style}</style>
			</head>
			<body>
				<header>
					Klamydiakokoelma · Discogs-linkit
					<nav aria-label="Muokkausympäristö">
						{modes.map((option) => (
							<a
								href={`/${option}`}
								aria-current={option === mode ? "true" : undefined}
							>
								{labels[option]}
							</a>
						))}
					</nav>
				</header>
				<main>
					<h1>{title}</h1>
					{children}
				</main>
			</body>
		</html>
	);
}
type LinkRow = { url: string; name: string };
const emptyRow = { url: "", name: "" };
function Form({
	mode,
	localSite,
	slug,
	title,
	links,
	previous,
	message,
}: {
	mode: Mode;
	localSite: string;
	slug: string;
	title: string;
	links: LinkRow[];
	previous: string;
	message?: string;
}) {
	const path = `/posts/${encodeURIComponent(slug)}`;
	return (
		<Page mode={mode} title={title}>
			<a href={`/${mode}`}>Kaikki julkaisut</a> ·{" "}
			<a href={(mode === "local" ? localSite : publicOrigin) + path}>
				{mode === "local" ? "Näytä paikallinen sivu" : "Näytä julkinen sivu"}
			</a>
			{message && <p role="status">{message}</p>}
			<form method="post" action={`/${mode}${path}`}>
				<input type="hidden" name="previous" value={previous} />
				<p>
					Anna linkille lukijalle näkyvä nimi, esimerkiksi levyn nimi ja painos.
					Tyhjennä osoite ja nimi poistaaksesi linkin.
				</p>
				{links.map((row, i) => (
					<fieldset>
						<legend>Discogs-linkki {i + 1}</legend>
						<label for={`url-${i}`}>Discogs-osoite</label>
						<textarea rows={2} id={`url-${i}`} name="links" spellcheck={false}>
							{row.url}
						</textarea>
						<label for={`name-${i}`}>Linkin nimi</label>
						<input type="text" id={`name-${i}`} name="name" value={row.name} />
					</fieldset>
				))}
				<button type="submit" name="action" value="add">
					Lisää linkkirivi
				</button>{" "}
				<button type="submit">
					{mode === "local"
						? "Tallenna paikallisesti"
						: "Tallenna julkiselle sivulle"}
				</button>
			</form>
		</Page>
	);
}

export function createEditor(
	databases: EditorDatabases,
	localSite = "http://localhost:3000",
) {
	const app = new Hono();
	app.use("*", async (c, next) => {
		c.header("Cache-Control", "no-store");
		c.header(
			"Content-Security-Policy",
			"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
		);
		c.header("Referrer-Policy", "same-origin");
		if (
			c.req.header("host") !== new URL(editorOrigin).host ||
			(c.req.method === "POST" && c.req.header("origin") !== editorOrigin)
		)
			return c.text("Forbidden", 403);
		await next();
	});
	app.get("/", (c) => c.redirect("/production"));
	for (const mode of modes)
		app.route(`/${mode}`, environmentRoutes(mode, databases[mode], localSite));
	return app;
}

function environmentRoutes(
	mode: Mode,
	database: EditorDatabases[Mode],
	localSite: string,
) {
	const app = new Hono();
	app.onError((_error, c) =>
		c.html(
			<Page mode={mode} title="Tietokanta ei ole käytettävissä">
				<p>
					{mode === "local"
						? "Tarkista paikallisen tietokannan asetukset (.env)."
						: "Tarkista Turso-yhteys, .env.turso-import ja tuotannon tietokantamigraatiot."}
				</p>
			</Page>,
			503,
		),
	);
	app.get("/", async (c) => {
		const db = await database();
		const q = c.req.query("q")?.trim() ?? "";
		const { rows } = await db.execute({
			sql: `SELECT p.slug,p.title FROM posts p
   WHERE NOT EXISTS (SELECT 1 FROM instagram_posts i WHERE i.post_slug=p.slug AND i.media_id=?)
   AND (instr(lower(p.title),lower(?))>0 OR instr(p.slug,?)>0) ORDER BY p.published_at DESC,p.slug`,
			args: [ABOUT_MEDIA_ID, q, q],
		});
		return c.html(
			<Page mode={mode} title="Valitse julkaisu">
				<form action={`/${mode}`}>
					<label for="query">Hae nimellä tai tunnuksella</label>
					<input type="search" id="query" name="q" value={q} />{" "}
					<button type="submit">Hae</button>
				</form>
				{rows.length ? (
					<ul>
						{rows.map((r) => (
							<li>
								<a
									href={`/${mode}/posts/${encodeURIComponent(String(r.slug))}`}
								>
									{String(r.title)}
								</a>
							</li>
						))}
					</ul>
				) : (
					<p>Julkaisuja ei löytynyt.</p>
				)}
			</Page>,
		);
	});
	app.get("/posts/:slug", async (c) => {
		const db = await database();
		const slug = c.req.param("slug"),
			post = await getPost(db, slug);
		if (!post) return c.notFound();
		const releases = await getDiscogsReleases(db, slug);
		return c.html(
			<Form
				mode={mode}
				localSite={localSite}
				slug={slug}
				title={post.title}
				previous={JSON.stringify(releases)}
				links={[
					...releases.map(({ id, name }) => ({
						url: `https://www.discogs.com/release/${id}`,
						name,
					})),
					emptyRow,
				]}
				message={
					c.req.query("saved") === "1"
						? mode === "local"
							? "Tallennettu paikalliseen tietokantaan."
							: "Tallennettu. Linkit näkyvät julkisella sivulla välimuistin päivityttyä."
						: undefined
				}
			/>,
		);
	});
	app.post("/posts/:slug", async (c) => {
		const db = await database();
		const slug = c.req.param("slug"),
			post = await getPost(db, slug);
		if (!post) return c.notFound();
		const body = await c.req.formData();
		const previous = body.get("previous");
		const urls = body.getAll("links"),
			names = body.getAll("name");
		if (
			typeof previous !== "string" ||
			!urls.length ||
			names.length !== urls.length
		)
			return c.text("Virheellinen lomake", 400);
		const links: LinkRow[] = [];
		for (const [i, url] of urls.entries()) {
			const name = names[i];
			if (typeof url !== "string" || typeof name !== "string")
				return c.text("Virheellinen lomake", 400);
			links.push({ url, name });
		}
		if (body.get("action") === "add")
			return c.html(
				<Form
					mode={mode}
					localSite={localSite}
					slug={slug}
					title={post.title}
					links={[...links, emptyRow]}
					previous={previous}
				/>,
			);
		const byId = new Map<number, string>();
		try {
			for (const row of links) {
				const name = row.name.trim();
				const urls = row.url.trim().split(/\s+/).filter(Boolean);
				if (name && urls.length !== 1)
					throw new Error("Anna jokaiselle nimetylle linkille yksi osoite.");
				for (const url of urls) {
					const id = releaseId(url);
					const saved = byId.get(id);
					if (saved && name && saved !== name)
						throw new Error("Samalla Discogs-julkaisulla on kaksi eri nimeä.");
					byId.set(id, name || saved || "");
				}
			}
		} catch (error) {
			return c.html(
				<Form
					mode={mode}
					localSite={localSite}
					slug={slug}
					title={post.title}
					previous={previous}
					links={links}
					message={error instanceof Error ? error.message : "Tarkista linkit."}
				/>,
				400,
			);
		}
		const releases = Array.from(byId, ([id, name]) => ({ id, name }));
		const tx = await db.transaction("write");
		try {
			const current = await getDiscogsReleases(tx, slug);
			if (
				JSON.stringify(current) !== previous &&
				JSON.stringify(current) !== JSON.stringify(releases)
			)
				return c.html(
					<Page mode={mode} title="Linkkejä on muutettu toisessa ikkunassa">
						<a href={`/${mode}/posts/${encodeURIComponent(slug)}`}>
							Avaa päivitetyt linkit
						</a>
					</Page>,
					409,
				);
			await tx.execute({
				sql: "DELETE FROM post_discogs_releases WHERE post_slug=?",
				args: [slug],
			});
			for (const { id, name } of releases)
				await tx.execute({
					sql: "INSERT INTO post_discogs_releases(post_slug,release_id,name) VALUES (?,?,?)",
					args: [slug, id, name],
				});
			await tx.commit();
		} finally {
			tx.close();
		}
		return c.redirect(
			`/${mode}/posts/${encodeURIComponent(slug)}?saved=1`,
			303,
		);
	});
	return app;
}
