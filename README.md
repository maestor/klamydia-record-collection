# Klamydiakokoelma

A Finnish record collection archive. Hono renders pages from a local SQLite database and private R2 media. A manual importer reads the owner's Instagram posts; synthetic fixtures are used only by tests.

Use Node 24 and npm 11.19.1. From the repository root:

```sh
npm ci
npm run db:migrate
npm run dev
```

Open http://localhost:3000/. The default database is `.data/collection.db`; the site requires the R2 read-only credentials described in [.env.example](.env.example). `npm run dev` loads `.env` if present; existing environment variables take precedence. See [Instagram access and importing](docs/instagram-access.md), [private R2 media](docs/r2-media.md), and [development and security](docs/development.md) for setup and tests.

For application structure and UI implementation rules, see [coding conventions](docs/coding-conventions.md).
