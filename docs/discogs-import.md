# Manual Discogs import

From the repository root, use Node 26 and set `DISCOGS_ACCESS_TOKEN` to maestor’s personal access token in the ignored `.env` file. Set `DATABASE_URL=file:.data/collection.db` in the same file for the default local database. Apply migrations before the first import. For that local path, run

```sh
DATABASE_URL=file:.data/collection.db npm run db:migrate
npm run import:discogs
```

Run the second command whenever the collection changes. A full refresh takes several minutes because it reads each distinct release and waits when Discogs rate-limits requests. On success the command prints folder, copy, and distinct release counts.

| Folder | ID | Contents |
| --- | --- | --- |
| Klamydia | 2038060 | Klamydia releases |
| Klamydia kokoelmilla | 2381651 | Compilations featuring Klamydia |
| Klamydia coveroinnit | 5186965 | Other artists covering Klamydia |
| Klamydia muut kokoonpanot | 2381653 | Current or former members’ other bands and solo releases |

## Turso

Use the [manual Turso setup](instagram-access.md#manual-instagram-imports-into-turso) for the database URL and write token. Add `DISCOGS_ACCESS_TOKEN` to the ignored `.env.turso-import` file. From the deployed revision, run `npm run db:backup:turso`, apply pending migrations with `npm run db:migrate:turso`, then run `npm run import:discogs:turso`. Both import commands honor existing shell environment variables ahead of their env file.

## Stored data

Each import replaces the four Discogs tables together after reading all folders, collection field definitions, pages of copies, and release details. Moving a copy updates its folder. Removing a copy from these folders removes it from the snapshot. An incomplete read leaves the previous snapshot available. After an error, fix the reported cause and rerun the command.

- `discogs_copies` holds one row per collection instance. Its JSON `data` retains the complete collection item, including date added, rating, basic information, and any private collection field values supplied by Discogs.
- `discogs_fields` stores the definitions for those field IDs, including names and options.
- `discogs_releases` holds a shared record for each pressing. Its JSON `data` retains the full release response, including available tracks, credits, artists, labels, formats, identifiers, images as metadata and URLs, and master release ID.
- `discogs_folders` stores the selected folders by stable ID with their current names and metadata.

For copy counts by folder, including empty folders:

```sql
SELECT f.name, count(c.instance_id) AS copies,
       count(DISTINCT c.release_id) AS distinct_releases
FROM discogs_folders f
LEFT JOIN discogs_copies c USING (folder_id)
GROUP BY f.folder_id;
```

The editor’s existing links match pressings by release ID. This query keeps every editorial link, including links to releases outside these folders. A matching release supplies its current Discogs title.

```sql
SELECT p.post_slug, p.name AS editorial_name, p.release_id, r.title
FROM post_discogs_releases p
LEFT JOIN discogs_releases r USING (release_id);
```
