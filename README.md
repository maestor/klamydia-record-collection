# Klamydiakokoelma

A Finnish record collection archive. Hono renders pages from local SQLite or Turso and private R2 media. Manual importers read the owner's Instagram posts and Discogs collection; synthetic fixtures are used only by tests.

Use Node 26 and npm 11.19.1. From the repository root:

```sh
npm ci
npm run db:migrate
npm run dev
```

Open http://localhost:3000/. The default database is `.data/collection.db`; the site requires the R2 read-only credentials described in [.env.example](.env.example). `npm run dev` loads `.env` if present; existing environment variables take precedence. See [Instagram access and importing](docs/instagram-access.md), [private R2 media](docs/r2-media.md), and [development and security](docs/development.md) for setup and tests.

For application structure and UI implementation rules, see [coding conventions](docs/coding-conventions.md).

For production database setup, GitHub verification/migrations, and the existing Vercel Hono project, follow [production deployment](docs/deployment.md). For the first Instagram import and later manual updates, use [manual Turso imports](docs/instagram-access.md#manual-instagram-imports-into-turso).

### Import the Discogs collection

Run `npm run import:discogs` to refresh maestor’s four Klamydia folders in a migrated local database. The importer reads every owned copy and fetches full release details for each distinct pressing. See the [Discogs import guide](docs/discogs-import.md) for setup, Turso commands, and SQL for matching releases to posts.

### Edit Discogs links on your Mac

Double-click **Discogs editor.command** in the project folder. Your browser opens the private editor in **Tuotanto** (Production) by default. Select **Paikallinen** (Local) to test with the SQLite database from `.env` (default `.data/collection.db`). Opening Local applies pending migrations to that file. Each tab keeps its own environment. Search for a post, open it, paste a Discogs URL into **Discogs-osoite**, enter the pressing or edition in **Linkin nimi**, and click **Tallenna paikallisesti** for Local or **Tallenna julkiselle sivulle** for Production. Use **Lisää linkkirivi** for another named release. Clear both fields to remove a link. Names appear under **Aiheesta muualla**, after the original Instagram link.

Production mode uses the production Turso database configured in `.env.turso-import`. The public deployment must include the Discogs migration and post view. Each save then updates that post directly, and the public page shows the change after its cache refreshes (usually within about five minutes). The editor requires the project's Node version and installed dependencies. Leave its Terminal window running while editing and press Control-C when finished. You can reopen it by double-clicking the same file.
