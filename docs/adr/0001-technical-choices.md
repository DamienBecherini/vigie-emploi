# ADR 0001 — Sprint 1 technical choices

**English** · [Français](0001-technical-choices.fr.md)

Date: 02/11/2026 · Status: accepted

## Context

Replace a Markdown flow plus a Python script (triage of e-mail alerts, register of dismissed offers, application tracking) with a local application that becomes the source of truth for offers, scores, statuses and tags. Constraints: Windows first, drivable by an AI, personal data outside the repository, possible opening later (MCP server, Electron, publication).

## Decisions

1. **TypeScript on Node 24, with no compilation step for the server.** Node 24 runs TypeScript by stripping the types: `bin/vigie-emploi.js` imports `src/cli/main.ts` directly. The code sticks to erasable syntax (`erasableSyntaxOnly`) and to `.ts` imports. `npm run build` checks the types and compiles only the interface. Consequence: a package installed from `node_modules` (public npm, Electron) will need a compilation step, to be added when the time comes (`tsc` with `rewriteRelativeImportExtensions`).
2. **SQLite through `node:sqlite`.** Built into Node, nothing to compile on Windows; FTS5 available (checked, SQLite 3.50). The module is marked experimental: the warning is hidden in the entry point. Planned fallback: `better-sqlite3`, whose API is very close.
3. **Versioned SQL migrations, no ORM.** Files `migrations/NNNN_nom.sql`, number in `PRAGMA user_version`, each migration in a transaction. The queries are written by hand in `src/core`.
4. **Default journal mode (no WAL).** The database is meant to be versioned in the data folder: a single file, complete after each write. `busy_timeout` at 5 s so that the CLI and the server can coexist.
5. **History plus denormalised columns.** `notes` and `statuts` keep the whole history (the latest row prevails); `offres.note` and `offres.statut` copy the current value so that sorting and filtering use an index. They are recomputed on each addition.
6. **Deduplication by `(source, id_site)`**: LinkedIn identifier, Indeed `jk`, Glassdoor `jobListingId`, Hellowork number, last segment of the Free-Work URL. Offers without a link that come from the register have the source `registre` and a fingerprint of their content; those from the tracker have the source `suivi` and the folder name.
7. **FTS5 full-text search** (tokenizer `unicode61 remove_diacritics 2`) in an external-content table, kept up to date by triggers. The words typed are put in quotes with prefix search: no FTS syntax injection.
8. **Hono + @hono/node-server** for the API and for serving the built interface (lightweight, testable without a network through `app.request`). Listens on 127.0.0.1 only, port 4410.
9. **React 19 + Vite + Tailwind CSS v4 + TanStack Table (v8) / Query interface.** Pagination, sorting and filters on the server side; filters in the URL; preferences (theme, zoom, columns) in `localStorage`. ShadCN/UI not adopted: a few home-made components are enough.
10. **MIME reading with `postal-mime`** (quoted-printable, base64, character sets, multipart) and decoding of HTML entities with `entities`, rather than a home-made parser.
11. **Configuration outside the code.** `vigie-emploi.config.json` (ignored by git) or `VIGIE_EMPLOI_DATA`. The exclusion lists for job titles and employers are in the user's configuration, not in the code.
12. **No call to an AI model, no downloading from LinkedIn / Indeed / Glassdoor.** Only Hellowork and Free-Work are read (public JSON-LD), and this can be turned off (`--no-fetch`, `telechargerJsonLd: false`).

## Importing the history: heuristics adopted

- JSON batches: each entry becomes a score (`origine = import-lot`, date taken from the file name) and the offer moves to `notee`.
- Register: each offer link in a row becomes an offer `ecartee` (or `abandonnee` when the reason starts with "GO"), with the date, the score and the reason. Grouped rows: job titles separated by "·", companies and scores distributed by position when their numbers match; ambiguous scores ("4 à 7", "≤ 2,5") not imported. "Mises de côté" (set aside) section: tag `a-reprendre`.
- Tracker: the offer link is looked for in the application folder; the status is deduced from the columns ("À envoyer" (to send) → `go`, sending date → `envoyee`, follow-up, interview; Closes (closed) section: rejection, withdrawal or closure).
- Idempotence: an identical status row (status, comment, origin) or an identical score (origin, date, value) is not added twice.
