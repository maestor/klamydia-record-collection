# Instagram access and manual imports

For the first production import and later manual updates, use [Manual Instagram imports into Turso](#manual-instagram-imports-into-turso). The access check below is optional; the importer also validates Instagram access.

Check the account's accessible media and carousel support using a Meta Unified Login token. The check makes read-only requests to Graph API v26.0; it does not write to the database or download images. It prints media identifiers, dates, public permalinks, caption lengths and whether media URLs are present, not tokens, captions or media URLs. It scans up to 100 pages and inspects the first carousel's children. A successful count is not proof that the entire Instagram history is accessible.

Add the account ID and token to the ignored `.env` file, using the names in `.env.example`. The token may also have messaging permission required by the chosen Meta configuration; the check only reads media. Never commit the token or paste it into chat. Run:

```sh
npm run instagram:check
```

Existing environment variables take precedence over `.env`. On failure, the command prints an HTTP status or a sanitized error, not the upstream response. Compare the oldest and newest returned posts and the carousel with Instagram; the check alone does not prove complete captions, carousel order, image quality or full historical coverage. The screenshot from Meta described the system-user token as non-expiring; tokens can still be revoked, and actual access must be verified. Check Meta's current storage and deletion requirements before treating downloaded content as a permanent archive.

## Initial live check

On 2026-10-30, an owned-account Unified Login token returned 197 accessible posts across multiple pages, with the oldest dated 2023-01-02 and the newest dated 2026-09-02. The owner confirmed the post count, oldest post, and that the sampled carousel contains two images. The API returned two ordered child image references. Four sample JPEGs were downloaded for inspection: the carousel and oldest images were 1440 × 1440 and the newest was 1440 × 1163. Sleeve text was readable in the inspected carousel image. Caption completeness and child order still need comparison with the Instagram originals; matching the count does not prove every post was returned.

The dashboard template required `instagram_basic` and `instagram_manage_messages`. This check uses only media endpoints and does not access messages. Current Meta Platform Terms and Developer Policies, including retention and deletion obligations, need verification before publishing or relying on permanent copies.

## Local importer

The default local database is `.data/collection.db`. Initialize it once, then inspect a bounded dry run and import a small sample:

```sh
DATABASE_URL=file:.data/collection.db npm run db:migrate
DATABASE_URL=file:.data/collection.db npm run import:instagram -- --limit 3 --dry-run
DATABASE_URL=file:.data/collection.db npm run import:instagram -- --limit 3
DATABASE_URL=file:.data/collection.db npm run dev
```

`import:instagram` loads `.env` and requires an explicitly configured `DATABASE_URL`. It accepts an existing local SQLite database or an authenticated Turso database. Check the target printed by the command before continuing beyond a dry run. The ordinary `db:migrate` command does not load `.env`. Run migrations before importing or starting the application after an update. Configure R2 credentials before a non-dry import.

## Manual Instagram imports into Turso

Run these commands from this repository on your computer, using Node 24 and `npm ci`. They write metadata directly to Turso and upload images to the existing private R2 bucket. They are manual commands; there is no scheduler or public import endpoint.

### Configure once

Create an ignored `.env.turso-import` file by copying `.env.example` once, then edit these values:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | The production `libsql://` URL used by Vercel |
| `DATABASE_AUTH_TOKEN` | A database-scoped Turso **read/write** token for manual importing |
| `INSTAGRAM_ACCOUNT_ID` | The owned Instagram account ID |
| `INSTAGRAM_ACCESS_TOKEN` | The working Meta Unified Login token |
| `R2_ENDPOINT`, `R2_BUCKET` | The existing private bucket's endpoint and name |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Bucket-scoped object read/write credentials for uploads |
| `R2_READ_ACCESS_KEY_ID`, `R2_READ_SECRET_ACCESS_KEY` | Separate object-read-only credentials used to verify uploads |

Keep `.env` configured for local development. The `:turso` commands require `.env.turso-import` and load it instead of `.env`; an already exported environment variable still takes precedence. In a terminal with old database settings, run `unset DATABASE_URL DATABASE_AUTH_TOKEN` before the commands so the file selects the intended target. Keep the import credentials on your computer; Vercel uses its separate read-only Turso token and R2 read credentials.

### First import from Instagram

If you already copied the edited local collection to Turso using the deployment guide, continue with the update procedure below. Otherwise, initialize Turso's schema, preview the complete import, then publish:

```sh
npm run db:migrate:turso
npm run import:instagram:turso -- --full --dry-run
npm run import:instagram:turso -- --full
```

After the dry run, confirm the printed database URL is production and review the JSON `created`, `updated`, `unchanged`, `total`, and `dryRun` fields. A first import into an empty database reports selected posts as `created`; if that looks right, run the final command. A dry run downloads and validates the selected Instagram images and reads Turso, but uploads no R2 objects and writes no database records, including import-run records.

For a small initial sample, use `--limit 3 --dry-run` followed by `--limit 3`, then run the full import. Only posts returned by the Instagram API are available; compare the total, oldest/newest posts, captions, and carousels with the account. Importing fresh from Instagram does not copy local title or image-description edits; the deployment guide's database-copy option preserves those.

### Later manual updates

Use the current deployed revision of this repository. Ensure its migrations have been applied (the independent Production Migration workflow does this; `npm run db:migrate:turso` also applies pending migrations). Run `npm run db:backup:turso` before a production write, and run only one importer per database, outside a production migration/deployment. Then:

```sh
npm run import:instagram:turso -- --full --dry-run
npm run import:instagram:turso -- --full
```

The full scan adds new posts, updates changed Instagram captions/images, and counts unchanged posts without duplicating them. Existing titles and owner-edited image descriptions are preserved. Captions are refreshed from Instagram when its fingerprint changes; upstream posts missing from the response are never automatically deleted. Local SQLite is not synchronized by a Turso import.

To refresh one post, substitute its **Instagram media ID** (not its shortcode or URL):

```sh
npm run import:instagram:turso -- --media-id 123456789 --dry-run
npm run import:instagram:turso -- --media-id 123456789
```

To revisit only the newest five posts, use `--limit 5 --dry-run`, then `--limit 5`. This selects the newest five returned posts, including previously imported ones; it does not mean five new posts. Use `--full` to catch older edits. Choose either `--media-id` or `--limit`.

### Confirm publication or retry

A successful command prints the summary and records `success` in Turso's `import_runs`. With the Turso CLI, inspect metadata without exposing tokens:

```sh
turso db shell <database-name> 'SELECT count(*) FROM instagram_posts;'
turso db shell <database-name> 'SELECT id, status, summary FROM import_runs ORDER BY id DESC LIMIT 5;'
```

Check a real post and its image on the final domain. No Vercel redeploy is needed for content-only changes; shared HTML can remain cached for five minutes plus the stale-while-revalidate window. Wait for fresh content or purge Vercel's CDN cache as described in [deployment](deployment.md).

If a run fails, read the operator error and the latest run status, fix the cause, and repeat the dry run and import. The importer uploads/verifies media before committing the selected metadata in one database transaction, so a media failure leaves published records intact. Unreferenced R2 objects can remain after a failure. A connection loss around commit can leave the outcome uncertain; inspect Turso and rerun, using stable media IDs to avoid duplicates. Do not reload a full SQLite dump over the live database for routine updates.

## Import behavior and limits

Omit `--limit` (or use `--full`) to revisit all accessible posts, up to 1,000 per run. To inspect one known Instagram media ID, use `--media-id ID` instead of `--limit`. A dry run reads and validates media but writes no database records or media. The importer accepts images and image-only carousels; a video, missing image, invalid source or failed download stops the whole publication. It stores metadata-stripped JPEGs and smaller previews under content-hashed names in private R2, then writes the complete batch in one database transaction. An interrupted or failed run can leave unreferenced media objects; retain old media until an explicit cleanup policy exists. Missing upstream posts are never deleted automatically. The initial title comes from the first caption line when suitable, or the post date otherwise; review it, as it is not a verified release title. Subsequent imports preserve titles and owner-edited image descriptions. Changes to captions or images are detected on a full scan, which downloads the selected images again.

Run only one importer at a time. The command records successful and failed runs in `import_runs` and prints created, updated, unchanged and total counts. Rate limits and server errors receive at most two retries; a `Retry-After` longer than five seconds stops the run for a later manual retry. A failure may leave a running record if the process is interrupted. A database commit followed by a run-status write failure may leave imported posts present despite an error; inspect the database and retry. HTML caching is not invalidated by the importer; see [production deployment](deployment.md) for deployment and cache refresh. Each import writes to its selected database only; [private R2 media](r2-media.md) is required for writes and serving. Back up both the database and referenced media before maintenance or migration.
