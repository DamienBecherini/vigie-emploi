<div align="center">

# vigie-emploi: reference

**Installation, workspace, résumés, configuration, commands, scoring grid, dashboard, tracking file, journal and development, in detail.**

**English** · [Français](reference.fr.md) · [README](../README.md) · [MCP server](mcp.md)

</div>

---

This document describes the application in detail. Command names, statuses and options are the application's identifiers: they are the same in every language.

## Installation

Requirement: Node.js 24 or later (SQLite is built into Node through `node:sqlite`, nothing to compile).

From npm (the package contains the code compiled to JavaScript and the built interface):

```sh
npx vigie-emploi init --language en     # without installing: creates ~/vigie-emploi
npm install -g vigie-emploi          # or a permanently installed command
```

Command written by `init` into `.mcp.json` and into the workspace instructions:

- run through `npx`: `npx -y vigie-emploi@<version>` (on Windows, `cmd /c npx …` for the MCP server). The npx cache can be cleared, so its path is never written. The version is pinned so that the database and the application stay in sync; if needed, npx downloads it again (connection required). The application instructions (`AGENTS.md`, or `AGENTS.fr.md` for a French workspace) are copied into `procedures/application.md`. To change versions, replace the number in `.mcp.json` and in the instructions, or switch to a global installation;
- installed (`npm install -g`, or from the repository): `node <path>/bin/vigie-emploi.js`, with the absolute path of the installation.

From the repository (contributors):

```sh
git clone https://github.com/DamienBecherini/vigie-emploi.git
cd vigie-emploi
npm install
npm run build      # type-checks, compiles src/ into dist/ and the interface into dist/ui
npm link           # makes the `vigie-emploi` command available everywhere (optional)
```

Without `npm link`, replace `vigie-emploi` with `node <path>/bin/vigie-emploi.js`. In the repository, `bin/vigie-emploi.js` runs the TypeScript in `src/` directly; without `src/` (npm package), it loads the compiled JavaScript from `dist/`, because Node refuses to run TypeScript located under `node_modules`. `npm pack` and `npm publish` rebuild everything (`prepack`).

## Creating your workspace

```sh
vigie-emploi init [folder] [--port 4410] [--mcp-name vigie-emploi] [--template plain|modern|compact] [--language fr|en]
```

Without a folder, `init` creates `~/vigie-emploi` (home folder; `~` is understood under PowerShell too). The folder must be new or empty. `init` copies the workspace template into it (`scaffold/`, or `scaffold-fr/` in French: AI instructions, context to fill in, guided onboarding, `a-deposer/` folder, application file template), the résumé template (`templates/cv/plain/`) and the sample grid, then writes `vigie-emploi.config.json` and `.mcp.json` (MCP server started with this data folder). It checks that Chrome, Edge or Chromium is available for PDFs, and prints the starting prompt to give the AI.

To try it without touching an existing installation: another folder, another port and another MCP server name (`--port 4411 --mcp-name vigie-emploi-test`).

## With Claude Desktop or another MCP client

The MCP server (`vigie-emploi mcp`) is enough for an AI with no access to your files and no terminal, such as Claude Desktop: it creates the workspace (`initialize_workspace`), provides the instructions as prompts (`onboarding`, `process-emails`, `prepare-go`, `targeted-cv`), reads the documents you drop in, writes the context, application files and résumés, generates the PDFs and starts the dashboard (`open_dashboard`). With Claude Desktop, the simplest route is the `.mcpb` extension ([One-click install](../README.md#one-click-install-claude-desktop)); you can also declare the server by hand in `claude_desktop_config.json`, with your workspace folder in `VIGIE_EMPLOI_DATA` and `VIGIE_EMPLOI_LANGUAGE` set to `en`. Details: [docs/mcp.md](mcp.md#claude-desktop).

Building the extension (for a GitHub release): `npm run mcpb` builds the application, prepares `build/mcpb/vigie-emploi/` (compiled JavaScript, interface, templates, production `node_modules` only), validates `mcpb/manifest.json` and packs everything into `build/vigie-emploi-<version>.mcpb` (about 7 MB) with the official `@anthropic-ai/mcpb` tool. Attach that file to the release.

## PDF résumés

```sh
vigie-emploi cv "cv/<name>.md" [--template <folder>]
```

Converts a Markdown résumé into an A4 PDF (headless Chrome, Edge or Chromium; `VIGIE_EMPLOI_BROWSER` to force a path), written next to the `.md`, and prints the page count (target: 2). The template is a folder (`gabarit.css`, fonts, optional `portrait.jpg|png|webp`): `--template`, otherwise the workspace's `cv/gabarit/`, otherwise the application's. The expected Markdown structure is described in `scaffold-en/cv/LISEZMOI.md` (French: `scaffold/cv/LISEZMOI.md`).

## Data folder configuration

The data folder holds the database and the inbox:

```
<folder>/
  data/vigie-emploi.sqlite   database (created on first run)
  emails/                    .eml files to ingest (deleted once processed)
  candidatures/              optional history to import (see import-history)
  profil/grille.json         scoring grid (vigie-emploi rubric --init copies the sample)
```

To designate it, in order of precedence:

1. the `--data <folder>` option on each command;
2. the `VIGIE_EMPLOI_DATA` environment variable;
3. a `vigie-emploi.config.json` file (not versioned) in the current folder, in the data folder or at the application root. Template: [`vigie-emploi.config.example.json`](../vigie-emploi.config.example.json).

| Key | Role | Default |
|---|---|---|
| `dataDir` | Data folder (absolute path or relative to the file) | — |
| `database` | Database path | `<data>/data/vigie-emploi.sqlite` |
| `emails` | Inbox | `<data>/emails` |
| `port` | Dashboard port | `4410` |
| `fetchJsonLd` | Read Hellowork / Free-Work pages | `true` |
| `excludedTitles` | Regular expressions (case-insensitive): titles discarded without reading | `[]` |
| `rejectedEmployers` | Regular expressions: refused employers (title, company, start of description) | `[]` |
| `terminal` | Command opening a terminal with the agent (dashboard buttons); `{folder}` and `{prompt}` are substituted | Windows: `["wt.exe", "-d", "{folder}", "claude", "{prompt}"]`; elsewhere: none |
| `mail` | Mailbox fetched over IMAP: `user`, `host`, `port`, `secure`, `folder`, `sinceDays`, `markSeen` (written by the "Mailbox" panel or `vigie-emploi mail setup`; the password is never there) | none |
| `language` | Language of the dashboard, the CLI messages, the MCP server texts shown to the user (what only the AI reads is in English) and the generated tracking file: `fr` or `en` (written by `init --language`, which also picks the language of the AI instructions); the selector in the dashboard header takes precedence, for that browser. Another language can be added without touching the logic: [docs/adding-a-language.md](adding-a-language.md) | the system's language at `init`; `fr` for a configuration file that names none |

Environment variables also recognised: `VIGIE_EMPLOI_CONFIG` (config file), `VIGIE_EMPLOI_DATABASE` (database), `VIGIE_EMPLOI_PORT`, `VIGIE_EMPLOI_LANGUAGE`, `VIGIE_EMPLOI_MAIL_PASSWORD` (mailbox password, instead of the keychain), `VIGIE_EMPLOI_BROWSER` (browser for the PDFs).

## Commands

All commands accept `--json` (stable output for an AI), `--data` and `--config`. `vigie-emploi --help` gives the full list.

| Command | Effect |
|---|---|
| `vigie-emploi mail [setup\|status\|fetch\|forget]` | Mailbox fetched over IMAP (see [Automating alert intake](../README.md#automating-alert-intake)): `setup` asks for the address, password and folder (`--address`, `--host`, `--port`, `--insecure`, `--folder`, `--since-days`, `--no-mark-seen`, `--password-stdin`); `fetch` fetches without ingesting; `forget` removes the settings and the password |
| `vigie-emploi ingest [--keep] [--no-fetch] [--no-mail] [--emails <folder>]` | Fetches the mailbox first when one is configured (unless `--no-mail`), then reads the `.eml` files, adds new offers (`new`, or `dismissed` with the reason for excluded titles), then **deletes the processed e-mails** (unless `--keep`). Summary: new, duplicates, discarded, to read |
| `vigie-emploi import-history` | Imports `candidatures/_lots/*.json`, `candidatures/_ecartees.md`, `candidatures/_SUIVI.md` and the "Suivi" sections of `candidatures/*/dossier-candidature.md` (journal, see below); read-only, idempotent, with a report of unrecognised lines. A `_SUIVI.md` generated by vigie-emploi is not re-read |
| `vigie-emploi list [filters]` | Paginated list: `--status a,b`, `--score-min`, `--score-max`, `--unscored`, `--source`, `--tag`, `--from` / `--until` (received), `--text`, `--contract`, `--remote`, `--applications`, `--page`, `--size`, `--sort`, `--order`; multi-level sort: `--sort received_at:desc,score:desc` |
| `vigie-emploi show <id>` | Details: description, scores, status history, tags, application |
| `vigie-emploi to-read [--limit N] [--full]` | Offers to process without a score, with the URL to read, or the description already extracted |
| `vigie-emploi score <id> --json '{…}'` | Records a score for an offer |
| `vigie-emploi score --file lot.json [--dry-run]` | Records a batch of scores (offers found by `id` or `url`, created if needed); `--dry-run` computes without saving |
| `vigie-emploi rubric [--instructions]` | Current scoring grid: criteria and weights, scales, rules, inventory, examples (`--instructions`: instructions for the AI) |
| `vigie-emploi rubric --update '{…}' --summary "…" [--dry-run]` | Partial change (weights, threshold, scales, rules, inventory); new version and re-scoring, or preview with `--dry-run` |
| `vigie-emploi rubric --history` / `--version N` / `--restore N` / `--init` | Grid versions, restoring a version, copying the sample grid |
| `vigie-emploi rescore` | Recomputes criterion-based scores with the current grid |
| `vigie-emploi status <id> <status> [--comment "…"]` | Changes the status (with history) |
| `vigie-emploi tag <id> +add -remove` | Adds / removes tags |
| `vigie-emploi apply <id>` | Moves the offer to `go` and shows what is needed to prepare the application |
| `vigie-emploi application <id> [--folder] [--cv] [--channel] [--sent-at] [--message] [--next-action]` | Records the application (`""` clears a field); with `--sent-at`, the offer moves to `sent` |
| `vigie-emploi next-action <id> "text"` | Next action of the application (`-` to clear it) |
| `vigie-emploi link <id> <url or ->` | Offer link |
| `vigie-emploi event <id> --type <type> [--at "DD/MM/YYYY HH:MM"] --summary "…" [--direction sent\|received] [--channel] [--contacts] [--details] [--amount 3000 --unit "€ HT"] [--days 6] [--file <path>]… [--done\|--no-done]` | Adds an event to the journal (types: `message`, `interview`, `test`, `proposal`, `decision`, `note`). `--at`: DD/MM/YYYY, YYYY-MM-DD, optional time, `tomorrow`, `+3`; defaults to now. Dated in the future, it is not done: it is a deadline |
| `vigie-emploi journal <id>` | Application journal: deadlines first (overdue on top), then newest to oldest |
| `vigie-emploi deadlines [--days 7]` | Overdue deadlines and those in the next N days, across all offers |
| `vigie-emploi done <event_id> [--no-done]` | Marks a deadline as done (or reopens it) |
| `vigie-emploi files <id>` | Files of the application folder (paths to cite in `--file`) |
| `vigie-emploi stats` | Applications by stage (sent, reply, interview, offer) and average delay before the first reply |
| `vigie-emploi generate-tracker [--output <file>] [--replace]` | Generates the application tracking table from the database: `candidatures/_SUIVI.genere.md` by default (preview), `candidatures/_SUIVI.md` with `--replace` |
| `vigie-emploi mcp` | MCP server (stdio) for an AI |
| `vigie-emploi serve [--port 4410] [--idle <minutes>]` | Starts the dashboard on http://localhost:4410; with `--idle`, it stops by itself after that long without a visit (`GET /api/health` gives the remaining time) |

Statuses: `new`, `to-read`, `scored`, `dismissed`, `go`, `sent`, `followed-up`, `interview`, `rejected`, `closed`, `withdrawn`. "My applications" groups `sent` and the statuses after it.

Score format (the batch format):

```json
{
  "source": "linkedin", "url": "https://www.linkedin.com/jobs/view/1234567890/",
  "title": "…", "company": "…", "location": "…", "contract": "Permanent", "compensation": "€50k–60k",
  "remote": "hybrid", "published": "NC", "stack": "PHP, API",
  "criteria": {
    "technique": { "score": 8, "justification": "PHP, REST API; gap: PostgreSQL" },
    "role": { "score": 7, "justification": "…" },
    "interet": { "score": 6, "justification": "…" },
    "risque": { "score": 7, "justification": "…" }
  },
  "inputs": { "onsite_days": 2, "salary_min": 55000, "salary_max": 65000, "unit": "year" },
  "blockers": [],
  "fit": "…", "gaps": "…", "read": true
}
```

With `criteria` (or `inputs`, `blockers`), the score is **computed** with the grid; a `score` field, if provided, is ignored and reported in `warnings`. The response contains the score, the exact value and the breakdown. Without `criteria`, it is an overall score from the old grid (`score`, `raw_score`, `penalties`), which stays frozen. Optional fields: `id` (instead of `url`), `description`, `tags`. Descriptive fields only fill in what is missing; the latest score prevails. `NC` (not stated), like an empty value, means unknown.

## Scoring grid

The grid lives in `<data>/profil/grille.json` (generic template: [`examples/rubric.json`](../examples/rubric.json), copied by `vigie-emploi rubric --init`). It contains:

- **weighted criteria** (7 at most) scored from 0 to 10: by the AI (`source: "ai"`, with an instruction in `description`) or by the application (`source: "computation"`, `computation: "remote"` or `"compensation"`); relative weights, normalised to 100%;
- **scales**: remote work (sub-score for 0 to 5 days on site, "unknown" value); pay (salary in K€/year and day rate in €/day: floor = 5, high target = 10, below the floor = 0, linear in between; optional full-remote floor; middle, low or high end of the range);
- **blocking rules**: identifier, label, effect `zero` or `cap` (with its value), active or not;
- **skills inventory** (technology → strong / medium / light / none), read by the AI for the technical criterion;
- **"worth a look" threshold** (quick view "Scored ≥ …");
- **reference examples** (offers scored criterion by criterion, with justification) to calibrate the AI;
- general **instructions** for the AI.

Computation: weighted average of the sub-scores → blocking rules (zero, cap) → rounded to the half point for display and filters (the exact value is kept). Missing data (criterion not scored, remote work or salary unknown): neutral value 5 and a **flag** on the offer. Days on site and salary come from `inputs`, otherwise from the offer's remote-work and pay fields.

Each save (panel, CLI, MCP, or file edited by hand) creates a **version** (number, date, author, summary) and **recomputes all criterion-based scores**, without re-reading any offer. Old overall scores stay as they are ("old grid" badge). You can go back to a previous version (it becomes a new version).

## Dashboard

`vigie-emploi serve`, then http://localhost:4410 (listens on 127.0.0.1 only). `--idle <minutes>` stops it after a period without activity.

Without a terminal (Claude Desktop): ask the AI to open the dashboard. The `open_dashboard` MCP tool starts it in the background if it is not already running (a separate process that survives an MCP server restart and stops after 60 minutes without activity), on the workspace's port or the next free one, and returns the address to click; `open: true` opens it in the default browser. It needs an installed `node` (24 or later); otherwise it runs inside the MCP server process, as long as Claude Desktop stays open.

- Server-side paginated table (25 to 500 rows per page), Thunderbird-style column sorting (the last header clicked becomes the primary sort, the previous one becomes secondary: click Score then Received to sort by date, then by score for equal dates; the URL keeps the levels), hideable columns.
- Filters: score, received and published dates, source, status, contract, remote work, tags, full-text search (accent-insensitive). Filters live in the URL: you can bookmark it.
- Quick views: to process, scored ≥ grid threshold (4.5 by default), my applications.
- **Scoring settings** (header button): weight sliders (normalised total shown), threshold, remote-work and pay scales, blocking rules (enable, effect, cap, add, delete), inventory (add, edit, delete, filter), reference examples recomputed live; **preview before saving** (offers whose score changes, offers crossing the threshold, clickable); mandatory change summary; version history and restore.
- **Mailbox** (header button): connection to the mailbox fetched over IMAP (provider recognised from the address, app-password help, choice of the folder), fetch now, forget the mailbox.
- **Work for the agent**, above the filters: "Fetch the mailbox" (when a mailbox is connected and nothing is waiting), "Process N e-mails" (`.eml` files waiting in the inbox) and "Prepare N applications" (offers in `go` without a folder). Each button opens a terminal in the data folder with the agent and the `/traiter-emails` or `/preparer-go` command (provided by the data folder, for example as Claude Code skills); the rest happens in that terminal. See [ADR 0005](adr/0005-agent-buttons-and-notifications.md).
- **Live updates**: the server notifies the page (Server-Sent Events, `/api/stream`) when the database changes, whatever the origin of the write (CLI, agent, another tab), and when the inbox changes; the page then reloads its data. The "Refresh the data" button remains available.
- **Coming up** banner above the table: overdue deadlines and those in the next 7 days, each opening its offer; **Statistics** button (applications by stage, reply delay).
- Details panel: description, link to the offer (editable), **score breakdown** (criterion by criterion: sub-score, weight, contribution, justification, origin; rules applied; flags; exact value and grid version), "old grid" badge for an overall score, **sub-score correction** (AI criteria, days on site, salary, rules; the score is recomputed and added to the history), old-style overall score, **application** (next action, sending date, channel), **journal** (deadlines first, overdue in red; add, edit, delete an event, mark a deadline as done; link a file from the folder chosen from a list), **folder files** (links that open them), status history, editable tags, status change, **Apply** button (copies `apply <id>` to the clipboard and moves the offer to `go`).
- Files: served read-only through `/api/file/<path>`, only inside the data folder (no `..`, no hidden files, neither `data/` nor `emails/`, symbolic links resolved); Markdown rendered as simple HTML without scripts (CSP), `?raw=1` for raw text, PDFs and images as they are. The server rejects requests whose host is not `localhost` / `127.0.0.1`, and writes coming from another origin (non-local `Origin` header or `Sec-Fetch-Site: cross-site`).
- Language (header selector), light / dark / system theme and palettes, text size (remembered in the browser), keyboard navigation (Enter opens an offer, Escape closes the panel). On a phone, the filters open in a drawer.

Interface development: `vigie-emploi serve` on one side, `npm run dev:ui` on the other (Vite on http://localhost:5173, the API is proxied to port 4410; `VIGIE_EMPLOI_API` to change it).

## Generated application tracking

`vigie-emploi generate-tracker` writes the tracking table in Markdown (`candidatures/_SUIVI.md`), readable without the application, in the workspace language: sections **In progress** (to send first, then from the latest sending to the oldest), **Sent without reply** (status "no news" or "no reply"), **Closed** (refused, abandoned, closed), columns Offer, Type, Channel, Sent, Status, Next action, Folder, links to the folders. At the top: "File generated by vigie-emploi on …: do not edit by hand".

Next action column: the next deadline in the journal ("**04/11**: Follow up", "(overdue)" if the date has passed), otherwise the `next_action` field.

The database prevails: the file is regenerated, never read back. If you import an existing Markdown tracking file (`import-history`), as long as an imported application has not changed, its cells are rewritten as they were; the next action entered in the interface, the CLI or through MCP is never overwritten by a new import. Before replacing an old `_SUIVI.md`, compare it with the `_SUIVI.genere.md` preview.

## Journal and deadlines

**The database knows what happened and when; the Markdown folder keeps the documents.** An event has a type, a date (or date-time), a summary, and if needed: direction (sent / received), channel, contacts, amount + unit, days, details, files (paths relative to the data folder). A future date not done is a deadline; past and not done, it is overdue.

Import (`import-history`): the "Suivi" sections of active folders (`candidatures/*/dossier-candidature.md`, not `_archives/`) become events with origin `import`: Date | Event table rows, dated bullets "- 13/10/2026 — …", dated checked boxes "- [x] Envoyée le : 13/10/2026". Unchecked boxes (to do) are not imported. Guessed type (message, interview, test, proposal, decision; `note` by default, listed in the report); relative Markdown links and backticked paths to existing files become linked files. Idempotent: one fingerprint per line; a line removed from the folder removes the imported event if it has not been modified since. A line already entered by hand (CLI, MCP, dashboard: same offer, same type, same day, compatible direction) is not imported, so that a new import does not duplicate the journal; the report counts them. A folder that no application points to is attached to the application without a folder whose company appears in its name (if unique).

An offer already being followed (`go` and beyond) seen again in an e-mail alert, a scored batch or the register no longer changes status; the alert leaves a trace in the journal ("Seen again on …", one per day).

## Development

```sh
npm test            # Vitest (fictitious fixtures in tests/fixtures)
npm run typecheck   # TypeScript (server + interface)
npm run build       # typecheck + interface build
npm run lint        # Biome: lint and formatting check (npm run format rewrites)
npm run coverage    # tests with the coverage of src/
npm run check       # everything the CI runs: typecheck, lint, build, tests
npm run mcpb        # Claude Desktop extension: build/vigie-emploi-<version>.mcpb
```

README screenshots and sample résumés (fictitious data, French and English):

```sh
node scripts/demo/demo.ts ../demo-en en                  # demo workspace (14 offers, applications, deadlines)
node scripts/demo/captures.mjs ../demo-en en             # docs/screenshots/dashboard.png, detail-offre.en.png, boite-mail.en.png (after npm run build)
bash scripts/demo/cv-exemples.sh                         # docs/examples/*.pdf and docs/screenshots/cv-*.png (needs pypdfium2)
```

How the code fits together, and why: [`code.md`](code.md). How to contribute: [`CONTRIBUTING.md`](../CONTRIBUTING.md).

Layout:

```
bin/vigie-emploi.js   command entry point (TypeScript from src/ in the repository, JavaScript from dist/ in the npm package)
migrations/           versioned SQL schema (PRAGMA user_version)
src/core/             configuration, links, normalisation, offer operations, queries, errors,
                      scoring grid (rubric/: pure schema and computation; rubric-storage.ts: file, versions, re-scoring)
src/sources/          one adapter per job site (link recognition, page reading, e-mail particularities)
src/db/               database opening and migrations
src/ingest/           .eml reading, ingestion, download of a public page
src/mail/             IMAP fetch, password in the system keychain, known providers
src/import/           import of a Markdown / JSON history (including folder journals)
src/cli/              command line: entry point, options, one file per group of commands in commands/
src/api/              HTTP server (Hono): JSON API (routes/), data folder file reading, built interface
src/mcp/              MCP server (stdio), tools wired to src/core (tools/); texts in src/mcp/i18n/
src/cv/               Markdown résumé → PDF (headless Chrome), templates, page count
src/init/             workspace creation
src/i18n/             translation mechanism and texts of the CLI, the API and the tracking file
src/export/           application tracking generation (Markdown)
ui/                   React 19 + Vite + Tailwind CSS v4 + TanStack Table / Query interface (texts in ui/src/i18n/)
scaffold/, scaffold-fr/   workspace template copied by init, in English and in French (AI instructions, onboarding, sample résumé)
templates/cv/          résumé templates ("plain", "modern", "compact")
examples/             sample scoring grids (French and English)
mcpb/, scripts/       Claude Desktop extension (manifest, build); scripts/demo/: demo workspace, screenshots, sample résumés
docs/adr/             architecture decisions
```

See also [`AGENTS.md`](../AGENTS.md) (how an AI drives the application), [`mcp.md`](mcp.md) (connecting the MCP server), [`adding-a-language.md`](adding-a-language.md) and the architecture decisions: [0001](adr/0001-technical-choices.md) (technical choices), [0002](adr/0002-mcp-and-tracker.md) (MCP and tracker), [0003](adr/0003-journal-and-deadlines.md) (journal and deadlines), [0004](adr/0004-scoring-grid.md) (scoring grid), [0005](adr/0005-agent-buttons-and-notifications.md) (agent buttons and notifications), [0006](adr/0006-redesign-0-7.md) (the 0.7 redesign).
