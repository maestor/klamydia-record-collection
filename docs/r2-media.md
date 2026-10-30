# Private R2 media

The default remains local media. To use a private R2 bucket, provide the endpoint, bucket name and two bucket-scoped credentials in ignored `.env` as shown in `.env.example`: an object read/write credential for import/copy commands and a separate object read-only credential for the web runtime. Keep the write credential out of any public deployment. R2 S3 endpoints normally use `https://<account-id>.r2.cloudflarestorage.com`; jurisdictional buckets require their corresponding endpoint as shown by Cloudflare.

Before switching modes, validate and copy the collection's current referenced image and preview files:

```sh
npm run r2:copy
npm run r2:copy -- --apply
```

The first command is a local read-only preflight. The second uploads under `collection/media/`, uses conditional create to avoid replacing existing objects, and reads every object back through the read-only credentials to verify its size and SHA-256 hash. A failed copy can leave already-uploaded objects; rerunning is safe and checks their bytes. It does not change the database, remove local files or change bucket visibility. It needs the local files, so restore them first if they were removed. Only run one importer or copy at a time.

After a successful copy, set `R2_MEDIA_MODE=r2` in `.env` and restart the server. `/media/<content-hash>.jpg` remains the stable URL in HTML. The application checks that each requested key is referenced by the database and issues a short-lived R2 GET redirect with `no-store` on the redirect; signed URLs are bearer credentials and should not be logged or stored. The R2 content response is cacheable and its immutable filename changes when bytes change. The bucket stays private. In R2 mode, subsequent imports upload and verify images directly in R2 before committing database changes; dry runs do not upload.

To restore all collection images from R2 into `.data/media/`, use `npm run r2:restore -- --apply`. The command uses read-only credentials, validates each file's hash and does not overwrite an existing file with different bytes. It does not restore the database; back up the SQLite database separately. A single bucket copy is not an independent backup, so arrange a separate backup for long-term recovery. Local fixture/browser tests run without R2; set `R2_MEDIA_MODE=local` for demo media. This integration does not move SQLite to Turso, configure Cloudflare CDN caching, or publish the website. Public access to images is mediated by the application, and browser caches may retain bytes already served.
