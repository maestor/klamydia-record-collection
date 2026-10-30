# Contributor instructions

Start with [README](README.md) and [development](docs/development.md). Keep public reads separate from mutation/import code and never expose secrets or render imported raw HTML. Preserve explicit cache and security policies; content-hashed assets must get a new URL when bytes change. Test observable reachable behavior and inspect coverage gaps without inventing a numeric threshold.

Use the installed skills in `.agents/skills/` for Git delivery, behavior-first testing, local verification, accessibility, browser UI verification, and project documentation. Work on a branch; pause for user review before the final verification gate. The external Klamydiakokoelma Plans vault is planning-only: edits confined there preserve repository Git state and do not enter branch/commit/PR delivery.

Browser automation must use a dedicated headless executable. For Playwright Chromium use its matching headless shell, `headless: true`, and no browser channel. Install the shell if needed and permitted; ask before using a visible or desktop browser, and never reuse a personal browser session unless requested. Close all task-owned contexts, browsers, automation sessions and VS Code browser panels, including on failure; do not stop unrelated processes or change Dock settings.
