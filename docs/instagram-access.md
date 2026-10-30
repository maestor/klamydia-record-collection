# Instagram access check

Check the account's accessible media and carousel support using a Meta Unified Login token. The check makes read-only requests to Graph API v26.0; it does not write to the database or download images. It prints media identifiers, dates, public permalinks, caption lengths and whether media URLs are present, not tokens, captions or media URLs. It scans up to 100 pages and inspects the first carousel's children. A successful count is not proof that the entire Instagram history is accessible.

Add the account ID and token to the ignored `.env` file, using the names in `.env.example`. The token may also have messaging permission required by the chosen Meta configuration; the check only reads media. Never commit the token or paste it into chat. Run:

```sh
npm run instagram:check
```

Existing environment variables take precedence over `.env`. On failure, the command prints an HTTP status or a sanitized error, not the upstream response. Compare the oldest and newest returned posts and the carousel with Instagram; the check alone does not prove complete captions, carousel order, image quality or full historical coverage. The screenshot from Meta described the system-user token as non-expiring; tokens can still be revoked, and actual access must be verified. Check Meta's current storage and deletion requirements before treating downloaded content as a permanent archive.

## Initial live check

On 2026-10-30, an owned-account Unified Login token returned 197 accessible posts across multiple pages, with the oldest dated 2023-01-02 and the newest dated 2026-09-02. The owner confirmed the post count, oldest post, and that the sampled carousel contains two images. The API returned two ordered child image references. Four sample JPEGs were downloaded for inspection: the carousel and oldest images were 1440 × 1440 and the newest was 1440 × 1163. Sleeve text was readable in the inspected carousel image. Sample images and captions are in the ignored `.data/instagram-sample/` directory. Caption completeness and child order still need comparison with the Instagram originals; matching the count does not prove every post was returned.

The dashboard template required `instagram_basic` and `instagram_manage_messages`. This check uses only media endpoints and does not access messages. Current Meta Platform Terms and Developer Policies, including retention and deletion obligations, need verification before publishing or relying on permanent copies.

## Local importer

The default local database is `.data/collection.db`. Initialize it once, then inspect a bounded dry run and import a small sample:

```sh
DATABASE_URL=file:.data/collection.db npm run db:migrate
DATABASE_URL=file:.data/collection.db npm run import:instagram -- --limit 3 --dry-run
DATABASE_URL=file:.data/collection.db npm run import:instagram -- --limit 3
DATABASE_URL=file:.data/collection.db npm run dev
```

`import:instagram` loads `.env`, requires an explicitly configured `DATABASE_URL`, and only accepts existing local SQLite databases. If `DATABASE_URL` is in `.env`, check it before running a write. The migration and seed commands do not load `.env`; never seed a real collection database. Run migrations before importing or starting the application after an update.

Omit `--limit` (or use `--full`) to revisit all accessible posts, up to 1,000 per run. To inspect one known Instagram media ID, use `--media-id ID` instead of `--limit`. A dry run reads and validates media but writes no database records or media. The importer accepts images and image-only carousels; a video, missing image, invalid source or failed download stops the whole publication. It stores metadata-stripped JPEGs and smaller previews under content-hashed names in `.data/media/`, then writes the complete batch in one SQLite transaction. An interrupted or failed run can leave unreferenced media files; retain old media until an explicit cleanup policy exists. Missing upstream posts are never deleted automatically. The initial title comes from the first caption line when suitable, or the post date otherwise; review it, as it is not a verified release title. Subsequent imports preserve titles and keep descriptions intact. Changes to captions or images are detected on a full scan, which downloads the selected images again.

Run only one importer at a time. The command records successful and failed runs in `import_runs` and prints created, updated, unchanged and total counts. Rate limits and server errors receive at most two retries; a `Retry-After` longer than five seconds stops the run for a later manual retry. A failure may leave a running record if the process is interrupted. A database commit followed by a run-status write failure may leave imported posts present despite an error; inspect the database and retry. HTML caching is not invalidated by the importer; deployment and explicit cache refresh remain future work. This local workflow does not use Turso or R2 and does not prove production behavior. Backup both the database and referenced media before maintenance or migration.
