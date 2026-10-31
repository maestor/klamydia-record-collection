# Coding conventions

The public site uses Hono server-rendered JSX. Pages work without JavaScript; browser controllers enhance the HTML. Use the existing stack and Biome formatting (`npm run lint`).

## File responsibilities

| Location | Responsibility |
| --- | --- |
| `src/app.ts` | Compose middleware and route groups; keep templates, SQL, and presentation rules elsewhere. |
| `src/routes/` | Parse and validate HTTP input, load data through repositories, prepare page props, and choose responses, status codes, headers, or redirects. |
| `src/repositories/` | Own public read queries and convert database values into typed records. Keep mutation/import code separate. |
| `src/presentation/` | Pure transformations such as archive context, reading text, safe media paths, image sizes, and gallery data. |
| `src/views/pages/` | Compose a complete page from explicit props, the layout, and components. |
| `src/views/components/` | Render a reusable or independently substantial part of a page, such as the post list or gallery. |
| `src/views/layout.tsx` | Own the HTML document, metadata, shared navigation, and page stylesheet/script references. |
| `src/views/sitemap.ts` | Render the XML sitemap and reference its stylesheet. |
| `src/middleware/` | Apply shared HTTP policies, including security and caching. |
| `src/client/` | Own browser interaction and enhancement state. |

For a page change, start at its route, follow its props to the page, and extract presentation logic only where the rule merits a name. Views receive plain typed data: do not pass Hono contexts, request objects, database clients, or raw database rows into templates. Views must not query the database, read environment variables, sign media URLs, or import mutation code. Repository types can be used as view props when they already describe the required data.

## Components and helpers

- Use named exports, PascalCase component names, and descriptive camelCase function names. Keep file names lowercase with hyphens, use `.tsx` only for JSX, and use `import type` for types.
- Give page props a named type when they contain several fields. Keep types beside their owner; share a type when another module actually consumes it. Do not use `any` or casts to bypass a boundary.
- Keep related small renderers together, as `PostItems` and `PostList` are today. Extract a component for reuse, a substantial markup block, or a distinct semantic responsibility. Do not create one file per HTML element or impose an arbitrary line limit.
- Keep JSX declarative: simple conditions, maps, and formatting are fine. Move parsing, validation, repeated transformations, and multi-step calculations to a named function or prepare them before rendering. Avoid immediately invoked functions inside attributes.
- Prefer direct imports and explicit dependencies. Add abstractions for current needs; avoid generic helper folders, barrel exports, component registries, and service layers without a concrete use.

## Imports

Use `#routes/*`, `#repositories/*`, `#presentation/*`, `#views/*`, `#middleware/*`, and `#i18n/*` for imports across those responsibilities. Keep imports within the same responsibility relative. Aliases omit extensions; relative imports keep `.js` for NodeNext. For example, a page can import gallery data from `#presentation/gallery` and its neighboring layout from `../layout.js`.

These are native Node package imports defined in `package.json`, rather than compiler-only path substitutions. The `development` condition points to `src/`; the default points to compiled `dist/` modules. TypeScript selects `development` through `customConditions`, and Vitest uses Vite's development resolution. Keep the mapping in `package.json` as the source of truth; do not duplicate it in TypeScript paths or test aliases.

The npm source commands and Playwright fixture server enable `--conditions=development`. For an ad hoc source command, use `node --conditions=development --import tsx <file.ts>`. Production uses `npm run build` followed by `npm start` with the default conditions, without a TypeScript loader or import-rewriting step. When adding an alias, check source execution, tests, and the compiled app.

These aliases resolve on the server. The current browser controller build emits standalone JavaScript without bundling dependencies; keep browser controllers self-contained unless that build changes.

## UI contracts

Use Finnish messages and date formatting from `src/i18n/fi.ts`. Render imported text through escaped JSX; never insert imported raw HTML. Preserve the local content-hashed media allowlist and Instagram source-link validation when moving presentation code.

Use links for navigation, buttons for actions, meaningful headings, accessible control names, and deliberate focus behavior. Keep status announcements and image alternatives intact. Existing classes, IDs, and `data-*` attributes used by CSS or controllers are contracts: update their consumers and behavioral tests together when changing them. Preserve full-image links and ordinary archive navigation when enhancements fail or JavaScript is disabled.

Add smooth, purposeful transitions to UI changes where they make interactions feel natural, such as changing images, opening dialogs, and expanding content. Respect `prefers-reduced-motion`, keep keyboard and focus behavior responsive, and avoid delaying access to content for the sake of animation.

Keep page asset URLs in `src/views/layout.tsx` and the sitemap stylesheet URL in `src/views/sitemap.ts`. Edit maintained CSS and plain JavaScript in `assets/`, and browser controllers in `src/client/`; `npm run assets:build` writes stable-name output under `public/assets/`. Commit those six outputs so Vercel includes them. The build runs before dev, production build, and E2E tests. Content-hashed vendor assets and icons still need a new filename and reference when their bytes change; consider cached pages before removing old files as described in [development](development.md).

## Verification and review

Protect observable behavior through `createApp` with an in-memory database and Testing Library. For a refactor, run the existing relevant tests before moving code and add characterization tests for uncovered contracts. Keep assertions on responses, accessible content, navigation, and security; avoid tests that merely check file structure or component wiring. Pure helper tests are appropriate for reusable deterministic rules when a public-route test would obscure the case.

Use Playwright for browser interactions, keyboard/focus flows, progressive enhancement, and rendering risks. Use the matching dedicated Chromium headless shell with no browser channel, and close task-owned sessions. Inspect coverage gaps in touched files rather than inventing a percentage target.

Run targeted checks during implementation. Follow the repository Git workflow: work on a branch, present the change for review, and run `npm run verify` after acceptance before commit/push delivery. See [development and security](development.md) and the installed skills in `.agents/skills/` for details.
