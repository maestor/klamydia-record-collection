# Production: Turso and Vercel

Vercel's GitHub integration builds previews for branch pushes and production deployments for `main`. The **Verify** workflow runs only for PRs targeting `main`. The separate **Production Migration** workflow runs on pushes to `main` and manual runs on `main`, independently of PR verification. It checks for pending migrations, backs up Turso only when needed, uploads the backup, then migrates. Vercel **Deployment Checks** must require **Migrate production database** before assigning production domains. No `VERCEL_TOKEN`, Vercel organization ID, or Vercel project ID is needed in GitHub.

## 1. Turso

Use your existing database's `libsql://` URL. Create database-scoped tokens: a **read-only** token for Vercel and separate **read/write** tokens for GitHub migrations and manual Instagram importing. An organization/API token is not a database token. With the [Turso CLI](https://docs.turso.tech/cli/db/tokens/create):

```sh
turso db show <database-name> --url
turso db tokens create <database-name> --read-only
turso db tokens create <database-name>
```

Store the output directly in the settings below; keep tokens out of Git and deployment logs. Track token expiry and replace stored tokens before they expire. The public runtime has no mutation routes; Turso's read-only token enforces database permissions. A connection-local SQLite pragma does not provide that guarantee on a remote service.

### Initial collection data

Schema migrations create tables; they do not populate the collection. Before the first release, either [import directly from Instagram](instagram-access.md#manual-instagram-imports-into-turso) or copy the existing local database as described below. Direct Instagram imports also support later manual updates. Copying the database preserves local title and image-description edits.

To copy the existing collection, stop local importing, back up `.data/collection.db`, and import it into the **empty** Turso database. With SQLite and the Turso CLI installed:

```sh
sqlite3 .data/collection.db 'PRAGMA integrity_check;'
sqlite3 .data/collection.db 'SELECT count(*) FROM posts;'
sqlite3 .data/collection.db .dump > .data/production-bootstrap.sql
turso db shell <database-name> < .data/production-bootstrap.sql
turso db shell <database-name> 'SELECT count(*) FROM posts;'
turso db shell <database-name> 'PRAGMA foreign_key_check;'
```

Require `integrity_check` to return `ok`, matching post counts, and no foreign-key violations. For this database-copy option, import the dump before Actions first migrates the target. Do not load it over a database that already has tables or records. If the target is already initialized, stop and plan the data transfer rather than dropping production tables. The dump contains collection data and belongs in ignored `.data/`, not Git. R2 objects keep their existing keys; no media upload is needed for this database transfer. See [Turso's dump/import instructions](https://docs.turso.tech/cli/db/shell).

The first migration run adopts the existing four idempotent migrations. Later migrations run once, in filename order, with checksums in `schema_migrations`; pending migrations and their ledger entries commit together or roll back together. Add a new numbered SQL file for each schema change. Never edit a migration already applied in production. Keep changes compatible with the currently deployed app: migrations run before promotion, and an app rollback does not undo database changes. Arrange Turso backups/recovery before the first release.

The database-copy bootstrap is a one-time transfer; later local imports do not automatically update Turso. Use the [manual Turso import commands](instagram-access.md#later-manual-updates) for subsequent Instagram updates. R2 restore remains local-only.

## 2. Vercel project

Connect the existing Hono project to this repository. Set the root directory to the repository root, framework to **Hono**, Node.js to **24.x**, and production branch to **main**. Leave the output directory unset. `vercel.json` supplies `npm ci` and `npm run build`. Root `app.js` exports the Hono app from compiled `dist/` modules; `npm start` remains the standalone Node server.

Add these variables to the Vercel **Production** environment:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Production `libsql://` URL, exactly the same as GitHub's migration target |
| `DATABASE_AUTH_TOKEN` | Turso **read-only** database token |
| `SITE_URL` | Final HTTPS origin, e.g. `https://your-domain.example`, without a path |
| `R2_ENDPOINT` | Existing account/jurisdiction S3 endpoint |
| `R2_BUCKET` | Existing private bucket name |
| `R2_READ_ACCESS_KEY_ID` | Existing bucket-scoped object-read-only access key |
| `R2_READ_SECRET_ACCESS_KEY` | Matching read-only secret |

Add the domain under Vercel Domains and apply the DNS records Vercel gives you. Do not add Instagram credentials or `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` to Vercel. R2 remains private; the application signs allowed image redirects with the read-only credentials.

### Require migration before production promotion

In Vercel **Project Settings → Build and Deployment → Deployment Checks**, require the GitHub check **Migrate production database** from workflow **Production Migration** for production.

Keep **Verify** as a GitHub PR merge requirement. Remove it from Vercel's production Deployment Checks if it was added previously: PR verification does not run on production pushes.

Keep automatic assignment of production domains enabled. Vercel builds normally but waits for the migration check on the deployed commit before promoting it to the production domain. A failed backup or migration therefore blocks promotion. Do not use Force Promote to bypass this check. This ordering depends on configuring the check in Vercel; a GitHub workflow alone cannot make Vercel wait. See [Vercel Deployment Checks](https://vercel.com/docs/deployment-checks).

After a workflow run exposes the migration check name, select it in Vercel. For the first setup, turn off automatic assignment of production domains until the check is configured; turn it back on once it is required. Keep the first deployment staged until its migration succeeds.

Other branches get Vercel previews. Set the same seven variables in **Preview** too. You can use the production read-only Turso token and R2 credentials to preview real collection content, or a separate, already migrated preview database. `SITE_URL` can stay at the final production origin for canonical links, or use a stable preview origin if you want preview-specific canonical links. Preview builds never run migrations. To initialize a separate preview database, run `npm run db:migrate` with its `DATABASE_URL` and write `DATABASE_AUTH_TOKEN` exported in your shell; the command does not load `.env`.

Vercel serves `public/` directly through its CDN. The config preserves immutable caching and `nosniff` for content-hashed `/assets/` files; Hono applies HTML, error, signed-redirect and CSP policies. Preserve old hashed assets when publishing new versions. See [Vercel's Hono integration](https://vercel.com/docs/frameworks/backend/hono).

## 3. GitHub Actions settings

Create a GitHub environment named **production**, restricted to deployments from `main`. Add:

| Kind | Name | Value |
| --- | --- | --- |
| Environment secret | `DATABASE_URL` | Production Turso `libsql://` URL |
| Environment secret | `DATABASE_AUTH_TOKEN` | Turso **read/write** database token |

These are the only user-configured GitHub secrets required, and belong to **Production Migration**. The PR Verify workflow uses no production secrets. No Vercel, R2, or Instagram credentials are needed by either workflow. Set the same `DATABASE_URL` in GitHub and Vercel; the GitHub token can write, while Vercel's token must be read-only.

Enable Actions and configure the `main` ruleset/branch protection to require PRs and the **Verify** check from workflow **Verify** before merging. The workflow alone does not enforce merge protection. Do not require **Migrate production database** for PR merges: it runs only on `main`, in its own workflow. Production migration workflow runs serialize without cancelling a running migration, and an outdated main revision stops before migration. New PR commits cancel superseded PR verification runs. Verification uses Node 24, npm 11.19.1 and Playwright's matching dedicated headless Chromium shell.

### Pending migrations and backups

`npm run db:migrate:pending` checks SQL filenames and checksums without changing the database. If all migrations are applied, the production workflow succeeds without a backup or migration. A changed applied migration fails the check instead of silently skipping it.

When migrations are pending, `npm run db:backup` synchronizes a temporary embedded replica, checks it with `PRAGMA quick_check`, and exports a standalone SQLite snapshot under ignored `.data/backups/`. The temporary replica and failed snapshots are removed. GitHub uploads the snapshot **before** migrating and retains the artifact for **14 days**. Backup or upload failure stops the migration. The backup contains database records and migration history, not R2 image bytes; manage artifact access and maintain separate media backups.

For an intentional manual backup using the credentials in `.env.turso-import`:

```sh
npm run db:backup:turso
```

Download a workflow artifact from **Actions → Production Migration → run → Artifacts**, or use the local file printed by the command. Check it on your computer with `sqlite3 <backup-file> 'PRAGMA quick_check;'` and inspect collection counts before considering recovery. Restore to a separate disposable database first; the workflow does not restore or reverse migrations automatically. A successful local test does not prove live replication, GitHub retention, or a completed production restore drill.

## 4. First release and recovery

After settings, the Deployment Check, and initial data are ready, merge the verified PR. Watch **Production Migration → Migrate production database** and the corresponding Vercel deployment. Once the build and migration check succeed, Vercel assigns the production domains automatically. If a backup or migration fails, inspect it and rerun the failed GitHub job after fixing the cause. You can also choose **Run workflow → main** in **Production Migration**. If the Vercel build fails after migration, the schema remains advanced; redeploy the same revision after fixing the build. Applied migrations are skipped on repeat runs.

Check `/`, `/archive`, one real post, `/about`, `/sitemap.xml`, a static asset, and an image redirect on the final domain. Confirm real image bytes load, canonical URLs use `SITE_URL`, redirects/errors use `no-store`, and assets use immutable caching. Inspect HTML cache headers and CDN behavior separately; local checks do not prove production caching or R2 permissions. Use Vercel logs for startup failures, without recording signed R2 URLs or tokens.

For an app rollback, use a known compatible Vercel deployment. Do not automatically reverse migrations. After content-only updates to Turso, allow the five-minute shared HTML cache and stale-while-revalidate window to expire or purge Vercel's CDN cache explicitly; the importer does not invalidate it.
