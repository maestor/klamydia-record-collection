# Klamydiakokoelma

A local, fixture-backed starting point for a Finnish record collection. Hono renders pages from SQLite; the current content and images are synthetic examples, not release information. The importer is not implemented yet.

Use Node 24 and npm 11.19.1. From the repository root:

```sh
npm ci
npm run db:migrate
npm run seed:demo
npm run dev
```

Open http://localhost:3000/. No credentials are required. `npm run dev` loads an optional `.env` file (see [.env.example](.env.example)); existing environment variables take precedence. See [development and security](docs/development.md) for commands, data boundaries and verification, and [Instagram access](docs/instagram-access.md) for the preliminary read-only check.
