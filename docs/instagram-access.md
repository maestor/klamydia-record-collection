# Instagram access check

The importer is not implemented yet. Before building it, check the account's accessible media and carousel support using a Meta Unified Login token. The check makes read-only requests to Graph API v26.0; it does not write to the database or download images. It prints media identifiers, dates, public permalinks, caption lengths and whether media URLs are present, not tokens, captions or media URLs. It scans up to 100 pages and inspects the first carousel's children. A successful count is not proof that the entire Instagram history is accessible.

Add the account ID and token to the ignored `.env` file, using the names in `.env.example`. The token may also have messaging permission required by the chosen Meta configuration; the check only reads media. Never commit the token or paste it into chat. Run:

```sh
npm run instagram:check
```

Existing environment variables take precedence over `.env`. On failure, the command prints an HTTP status or a sanitized error, not the upstream response. Compare the oldest and newest returned posts and the carousel with Instagram; the check alone does not prove complete captions, carousel order, image quality or full historical coverage. The screenshot from Meta described the system-user token as non-expiring; tokens can still be revoked, and actual access must be verified. Check Meta's current storage and deletion requirements before treating downloaded content as a permanent archive.

## Initial live check

On 2026-10-30, an owned-account Unified Login token returned 197 accessible posts across multiple pages, with the oldest dated 2023-01-02 and the newest dated 2026-09-02. The owner confirmed the post count, oldest post, and that the sampled carousel contains two images. The API returned two ordered child image references. Four sample JPEGs were downloaded for inspection: the carousel and oldest images were 1440 × 1440 and the newest was 1440 × 1163. Sleeve text was readable in the inspected carousel image. Sample images and captions are in the ignored `.data/instagram-sample/` directory. Caption completeness and child order still need comparison with the Instagram originals; matching the count does not prove every post was returned.

The dashboard template required `instagram_basic` and `instagram_manage_messages`. This check uses only media endpoints and does not access messages. Current Meta Platform Terms and Developer Policies, including retention and deletion obligations, need verification before publishing or relying on permanent copies.
