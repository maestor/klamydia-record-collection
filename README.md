# Klamydiakokoelma

A Finnish record collection archive. Hono renders pages from a local SQLite database and local media files. A manual importer reads the owner's Instagram posts; synthetic fixtures remain available for tests and demos.

Use Node 24 and npm 11.19.1. From the repository root:

```sh
npm ci
npm run db:migrate
npm run dev
```

Open http://localhost:3000/. The default database is `.data/collection.db`; the site can run without credentials once it has been migrated. `npm run dev` loads an optional `.env` file (see [.env.example](.env.example)); existing environment variables take precedence. See [Instagram access and importing](docs/instagram-access.md) to populate the collection, [private R2 media](docs/r2-media.md) for remote images, and [development and security](docs/development.md) for tests and the separate demo workflow.
