# Private R2 media

The app serves collection images from a private R2 bucket. Configure the endpoint, bucket name and bucket-scoped read-only credentials in `.env` as shown in `.env.example`. The importer also needs separate object read/write credentials; keep those out of the public runtime. R2 S3 endpoints normally use `https://<account-id>.r2.cloudflarestorage.com`; jurisdictional buckets require their corresponding endpoint.

HTML uses stable `/media/<content-hash>.jpg` URLs. The app checks that each key is referenced by the database and issues a short-lived R2 GET redirect with `no-store` on the redirect. Signed URLs are bearer credentials: do not log or store them. R2 image responses can be cached; filenames change whenever bytes change. Imports upload and verify images before committing database changes. The bucket stays private.

Imports produce previews with a maximum edge of 640 pixels using MozJPEG at quality 80; full images retain their existing encoding. Home and archive documents prioritize the first card image; appended archive batches remain lazy-loaded. Existing previews keep their bytes and URLs until their posts are re-imported. Re-importing publishes new content-hashed preview URLs; retain old objects for cached pages.

For recovery or an independent backup, `npm run r2:restore -- --apply` downloads all referenced images to `.data/restored-media/`, verifies their hashes, and refuses to overwrite files with different contents. These files are not served by the app. The command does not restore the database; back up SQLite separately. A single bucket copy is not an independent backup, so arrange a separate backup for long-term recovery.

For Turso, Vercel, and production environment settings, see [production deployment](deployment.md). R2 setup does not configure Cloudflare CDN caching. Public access to images is mediated by the application, and browser caches may retain bytes already served.
