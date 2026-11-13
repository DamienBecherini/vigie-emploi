<div align="center">

# vigie-emploi

[Français](README.md) · **English**

**Your job or freelance search, driven by your AI, without ever making you lie.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js ≥ 24](https://img.shields.io/badge/Node.js-%E2%89%A5%2024-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![SQLite](https://img.shields.io/badge/SQLite-local-003B57?logo=sqlite&logoColor=white)](https://nodejs.org/api/sqlite.html)
[![MCP](https://img.shields.io/badge/MCP-server-6E56CF)](https://modelcontextprotocol.io)
[![Agents](https://img.shields.io/badge/agents-Claude%20Code%20%C2%B7%20Cursor%20%C2%B7%20Codex-D97757)](#requirements)
[![Data](https://img.shields.io/badge/data-100%25%20local-2EA043)](#privacy)

</div>

---

vigie-emploi is a local kit to look for a permanent job or freelance assignments with an AI agent (Claude Code, Cursor, Codex…). The AI triages the offers you receive through e-mail alerts, scores each one with **your** grid, prepares the applications you approve (application file, tailored résumé, message) and keeps track of the follow-up. Everything stays on your computer.

> Everything is available in English with `init --langue en`: the AI instructions and workspace templates (your agent works and writes in English: résumés, messages, application files), the sample scoring grid, the MCP server, the dashboard and the CLI messages. The language selector in the dashboard header switches the dashboard only. Command names, statuses and the workspace's file names stay in French: they are identifiers.

The name means "job lookout" (*vigie*, the sailor watching from the crow's nest). Two promises:

- **it keeps watch for you**: your job alerts are read and triaged, a transparent, adjustable scoring grid (weights, pay floor, remote work, blocking rules) only shows you the offers worth your time, and no follow-up is forgotten;
- **it never makes you lie**: the AI relies on an inventory of what you can and cannot claim, built with you during onboarding. It only writes in a résumé what you can defend in an interview. Application after application, you refine with it what makes your value and the message you want to convey, until the result truly sounds like you.

## How it works

```
e-mail alerts (.eml)  →  triage and scoring by the AI (your grid)  →  your "go"
        →  application file + tailored résumé (PDF, 2 pages) + message  →  sent by you  →  follow-up (journal, deadlines, reminders)
```

1. **Guided onboarding**: you drop your résumé (and the PDF export of your LinkedIn profile) into `a-deposer/`. The AI reads them, looks at your public pages if it can, then asks you small batches of questions: targets, background, evidence, what sets you apart, risks, things never to claim, conditions. From this it writes your **context** (`_CONTEXTE.md`), your **grid** and a first **résumé**, which you approve.
2. **Alert triage**: a mail filter saves the alerts (LinkedIn, Indeed, Glassdoor, Hellowork, Free-Work…) into `emails/` (see [Automating alert intake](#automating-alert-intake)). The AI ingests them, discards off-target ones, scores the rest criterion by criterion (the application computes the score) and shows you the best offers.
3. **Applications**: on your "go", the AI prepares the application file, a tailored résumé that fits on two pages, and the message adapted to the form and its character limit. **You do the sending.**
4. **Follow-up**: you tell it what happened ("sent yesterday", "interview Thursday at 2 pm"); the AI keeps the journal, the deadlines and the tracking table.

The application **calls no AI model**: your agent reads and writes, the application keeps the state (SQLite database, web dashboard, CLI, MCP server).

![Dashboard: offers sorted by date then score, upcoming deadlines, statistics](docs/captures/tableau-de-bord.png)

*The dashboard (fictitious data, French interface): offers sorted by date received then by score, deadlines for the next seven days, applications by stage.*

![Offer details: score breakdown criterion by criterion](docs/captures/detail-offre.png)

*Offer details: each criterion, its sub-score, its weight and its contribution to the final score, with the AI's justification.*

### Résumés

Résumés are written in Markdown and rendered as two-page A4 PDFs, with three templates: "sobre" (serif), "moderne" (colour banner) and "compact" (single column, dense). The AI can also adapt the stylesheet to a model you show it.

<div align="center">
<a href="docs/exemples/CV-damien-becherini-sobre.en.pdf"><img src="docs/captures/cv-sobre-en.png" alt="The author's résumé, “sobre” template (page 1 of the PDF)" width="32%"></a>
<a href="docs/exemples/CV-damien-becherini-moderne.en.pdf"><img src="docs/captures/cv-moderne-en.png" alt="The author's résumé, “moderne” template (page 1 of the PDF)" width="32%"></a>
<a href="docs/exemples/CV-damien-becherini-compact.en.pdf"><img src="docs/captures/cv-compact-en.png" alt="The author's résumé, “compact” template (page 1 of the PDF)" width="32%"></a>

<em>My own résumé, written with vigie-emploi and rendered with each of the three templates (first page; click to open the full PDF). Markdown source: <a href="docs/exemples/CV-damien-becherini.en.md">docs/exemples/CV-damien-becherini.en.md</a>.</em>
</div>

## Requirements

- **Node.js 24** or later, except with the Claude Desktop extension (it uses the Node built into the application).
- **Chrome, Edge or Chromium** (for PDF résumés).
- **An AI**: Claude Desktop (one-click extension, nothing else to install), or an agent that works in a folder: Claude Code preferably (MCP server and skills included); Cursor, Codex or another agent read the same instructions (`AGENTS.md`) and use the CLI.
- Optional: a **browser driven by the AI** with your sessions (for example Claude in Chrome), to read LinkedIn, Indeed or Glassdoor offers. Without it, you paste the offer text when the AI asks.

## Getting started

### One-click install (Claude Desktop)

1. Download the `vigie-emploi-<version>.mcpb` file (the repository's [Releases](https://github.com/DamienBecherini/vigie-emploi/releases) page).
2. Double-click it (or drag it into the Claude Desktop window, or **Settings → Extensions → Advanced settings → Install Extension…**), then click **Install**.
3. Choose the **workspace folder** (by default `ma-recherche` in your home folder; it does not need to exist) and the **language**: type `en`.
4. In a new conversation, ask "create my vigie-emploi workspace", or **+** button → vigie-emploi → **`demarrage`** prompt. Claude creates the workspace, asks you to drop your résumé into `a-deposer/`, then runs the onboarding.

No terminal and no Node to install: the extension contains the application and uses the Node built into Claude Desktop. To browse your job ads in the dashboard, ask Claude to open it (`ouvrir_tableau_de_bord` tool). Details (in French): [docs/utiliser-avec-une-ia.md](docs/utiliser-avec-une-ia.md#claude-desktop).

### With Claude Code or another agent

```sh
npx vigie-emploi init ~/my-search --langue en
```

Nothing to clone or build: npx downloads the application and runs `init`. The workspace remembers the version used (`npx -y vigie-emploi@<version>`, in `.mcp.json` and in the AI instructions). For a permanently installed command: `npm install -g vigie-emploi`, then `vigie-emploi init ~/my-search`. To contribute, install from the repository (see [Installation](#installation)).

`init` creates your workspace (`--gabarit moderne` or `compact` to change the résumé template; `--langue en` for English AI instructions, grid, dashboard and CLI, French being the default) and prints the starting prompt to give your AI. Then:

1. drop your résumé into `~/my-search/a-deposer/`;
2. open your AI in `~/my-search` (Claude Code: `cd ~/my-search` then `claude`, and accept the MCP server);
3. paste the prompt printed by `init`.

Onboarding takes two sessions of about half an hour each.

## Automating alert intake

The AI processes the alerts found in the workspace's `emails/` folder, as `.eml` files. You can drag the e-mails there by hand from your mail client, but the simplest is a filter that does it each time mail is fetched.

1. Create **alerts** on the job sites you use (LinkedIn, Indeed, Glassdoor, Hellowork, Free-Work…), with your keywords.
2. Set up your mail client to **save each alert received as an `.eml` file in `emails/`**, then move it to a separate folder.
3. Then ask your AI to "traiter les e-mails" (process the e-mails), or click "Traiter les e-mails" in the dashboard, with Claude Code. Processed files are deleted from `emails/`.

### Example with Thunderbird and FiltaQuilla

Thunderbird cannot save a message as a file from a filter; the [FiltaQuilla](https://addons.thunderbird.net/thunderbird/addon/filtaquilla/) add-on adds this action.

**1. Install and configure FiltaQuilla**

- Menu **Tools → Add-ons and Themes**, search for "FiltaQuilla" and install the add-on.
- Open its **options** (Add-ons → FiltaQuilla → Options). In the list of actions, **enable "Save Message as File"**: it is disabled by default and does not appear in filters until it is.

**2. Create the filter**

- Menu **Tools → Message Filters**, choose the account that receives the alerts, then **New**.
- Name it, for example "Job alerts".
- Choose **"Match any of the following"** and add a condition **From → contains → the sending address of the alerts** for each site (open an alert you received to find it).
- Under **"Perform these actions"**:
  1. **Save Message as File**: choose the `emails/` folder of your workspace (for example `~/my-search/emails`);
  2. *(optional)* **Move Message to** a subfolder, for example "Processed alerts": you can then see in Thunderbird what has already been passed on.
- Let the filter run on **Getting New Mail**. For alerts already received: select the filter, then **Run Now** on the inbox.

With another mail client the idea is the same: any rule or script able to save a message as `.eml` into `emails/` will do.

## Privacy

Your workspace (résumés, context, database, applications) stays on your disk. Nothing is sent anywhere except to the AI you use. The application only downloads the public pages of Hellowork and Free-Work offers; it never reads LinkedIn, Indeed or Glassdoor by script.

## Reference

The rest of this document describes the application in detail: commands, configuration, grid, dashboard. Command names, statuses and options are in French, as in the application.

### Installation

Requirement: Node.js 24 or later (SQLite is built into Node through `node:sqlite`, nothing to compile).

From npm (the package contains the code compiled to JavaScript and the built interface):

```sh
npx vigie-emploi init ~/my-search    # without installing
npm install -g vigie-emploi          # or a permanently installed command
```

Command written by `init` into `.mcp.json` and into the workspace instructions:

- run through `npx`: `npx -y vigie-emploi@<version>` (on Windows, `cmd /c npx …` for the MCP server). The npx cache can be cleared, so its path is never written. The version is pinned so that the database and the application stay in step; if needed, npx downloads it again (connection required). The application instructions (`AGENTS.md`, or `AGENTS.en.md` for an English workspace) are copied into `procedures/application.md`. To change versions, replace the number in `.mcp.json` and in the instructions, or switch to a global installation;
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

Former names: the application used to be called **cap-emploi**. The `cap-emploi` command no longer exists (use `vigie-emploi`); the `CAP_EMPLOI_*` variables, the `cap-emploi.config.json` file and the `data/cap-emploi.sqlite` database are still recognised; the new names take precedence.

### Creating your workspace

```sh
vigie-emploi init <folder> [--port 4410] [--nom-mcp vigie-emploi] [--langue fr|en]
```

The folder must be new or empty. `init` copies the workspace template into it (`modele/`: AI instructions, context to fill in, guided onboarding, `a-deposer/` folder, application file template), the résumé template (`gabarits/cv/sobre/`) and the sample grid, then writes `vigie-emploi.config.json` and `.mcp.json` (MCP server started with this data folder). It checks that Chrome, Edge or Chromium is available for PDFs, and prints the starting prompt to give the AI.

To try it without touching an existing installation: another folder, another port and another MCP server name (`--port 4411 --nom-mcp vigie-emploi-test`).

### With Claude Desktop or another MCP client

The MCP server (`vigie-emploi mcp`) is enough for an AI with no access to your files and no terminal, such as Claude Desktop: it creates the workspace (`initialiser_espace`), provides the instructions as prompts (`demarrage`, `traiter-emails`, `preparer-go`, `cv-cible`), reads the documents you drop in, writes the context, application files and résumés, generates the PDFs and starts the dashboard (`ouvrir_tableau_de_bord`). With Claude Desktop, the simplest route is the `.mcpb` extension ([One-click install](#one-click-install-claude-desktop)); you can also declare the server by hand in `claude_desktop_config.json`, with your workspace folder in `VIGIE_EMPLOI_DATA` and `VIGIE_EMPLOI_LANGUE` set to `en`. Details: [docs/utiliser-avec-une-ia.md](docs/utiliser-avec-une-ia.md#claude-desktop).

Building the extension (for a GitHub release): `npm run mcpb` builds the application, prepares `build/mcpb/vigie-emploi/` (compiled JavaScript, interface, templates, production `node_modules` only), validates `mcpb/manifest.json` and packs everything into `build/vigie-emploi-<version>.mcpb` (about 5 MB) with the official `@anthropic-ai/mcpb` tool. Attach that file to the release.

### PDF résumés

```sh
vigie-emploi cv "cv/<name>.md" [--gabarit <folder>]
```

Converts a Markdown résumé into an A4 PDF (headless Chrome, Edge or Chromium; `VIGIE_EMPLOI_NAVIGATEUR` to force a path), written next to the `.md`, and prints the page count (target: 2). The template is a folder (`gabarit.css`, fonts, optional `portrait.jpg|png|webp`): `--gabarit`, otherwise the workspace's `cv/gabarit/`, otherwise the application's. The expected Markdown structure is described in `modele/cv/LISEZMOI.md`.

### Data folder configuration

The data folder holds the database and the inbox:

```
<folder>/
  data/vigie-emploi.sqlite   database (created on first run)
  emails/                  .eml files to ingest (deleted once processed)
  candidatures/            optional history to import (see import-historique)
  profil/grille.json       scoring grid (vigie-emploi grille --init copies the sample)
```

To designate it, in order of precedence:

1. the `--data <folder>` option on each command;
2. the `VIGIE_EMPLOI_DATA` environment variable;
3. a `vigie-emploi.config.json` file (not versioned) in the current folder, in the data folder or at the application root. Template: [`vigie-emploi.config.example.json`](vigie-emploi.config.example.json).

| Key | Role | Default |
|---|---|---|
| `dossierDonnees` | Data folder (absolute path or relative to the file) | — |
| `base` | Database path | `<data>/data/vigie-emploi.sqlite` |
| `emails` | Inbox | `<data>/emails` |
| `port` | Dashboard port | `4410` |
| `telechargerJsonLd` | Read Hellowork / Free-Work pages | `true` |
| `titresExclus` | Regular expressions (case-insensitive): titles discarded without reading | `[]` |
| `employeursRefuses` | Regular expressions: refused employers (title, company, start of description) | `[]` |
| `terminal` | Command opening a terminal with the agent (dashboard buttons); `{dossier}` and `{invite}` are substituted | Windows: `["wt.exe", "-d", "{dossier}", "claude", "{invite}"]`; elsewhere: none |
| `langue` | Language of the dashboard, the CLI messages, the MCP server and the generated tracking file: `fr` or `en` (written by `init --langue`, which also picks the language of the AI instructions); the selector in the dashboard header takes precedence, for that browser | `fr` |

Environment variables also recognised: `VIGIE_EMPLOI_CONFIG` (config file), `VIGIE_EMPLOI_BASE` (database), `VIGIE_EMPLOI_PORT`, `VIGIE_EMPLOI_LANGUE`.

### Commands

All commands accept `--json` (stable output for an AI), `--data` and `--config`. `vigie-emploi --help` gives the full list.

| Command | Effect |
|---|---|
| `vigie-emploi ingest [--keep] [--no-fetch] [--emails <folder>]` | Reads the `.eml` files, adds new offers (`nouvelle`, or `ecartee` with the reason for excluded titles), then **deletes the processed e-mails** (unless `--keep`). Summary: new, duplicates, discarded, to read |
| `vigie-emploi import-historique` | Imports `candidatures/_lots/*.json`, `candidatures/_ecartees.md`, `candidatures/_SUIVI.md` and the "Suivi" sections of `candidatures/*/dossier-candidature.md` (journal, see below); read-only, idempotent, with a report of unrecognised lines. A `_SUIVI.md` generated by vigie-emploi is not re-read |
| `vigie-emploi list [filters]` | Paginated list: `--statut a,b`, `--note-min`, `--note-max`, `--sans-note`, `--source`, `--tag`, `--depuis` / `--jusqua` (received), `--texte`, `--contrat`, `--teletravail`, `--candidatures`, `--page`, `--taille`, `--tri`, `--ordre`; multi-level sort: `--tri recue_le:desc,note:desc` |
| `vigie-emploi show <id>` | Details: description, scores, status history, tags, application |
| `vigie-emploi a-lire [--limite N] [--complet]` | Offers to process without a score, with the URL to read, or the description already extracted |
| `vigie-emploi noter <id> --json '{…}'` | Records a score for an offer |
| `vigie-emploi noter --fichier lot.json [--essai]` | Records a batch of scores (offers found by `id` or `url`, created if needed); `--essai` computes without saving |
| `vigie-emploi grille [--consignes]` | Current scoring grid: criteria and weights, scales, rules, inventory, examples (`--consignes`: instructions for the AI) |
| `vigie-emploi grille --modifier '{…}' --resume "…" [--essai]` | Partial change (weights, threshold, scales, rules, inventory); new version and re-scoring, or preview with `--essai` |
| `vigie-emploi grille --historique` / `--version N` / `--restaurer N` / `--init` | Grid versions, restoring a version, copying the sample grid |
| `vigie-emploi renoter` | Recomputes criterion-based scores with the current grid |
| `vigie-emploi statut <id> <status> [--commentaire "…"]` | Changes the status (with history) |
| `vigie-emploi tag <id> +add -remove` | Adds / removes tags |
| `vigie-emploi candidater <id>` | Moves the offer to `go` and shows what is needed to prepare the application |
| `vigie-emploi candidature <id> [--dossier] [--cv] [--canal] [--envoyee-le] [--message] [--prochaine-action]` | Records the application (`""` clears a field); with `--envoyee-le`, the offer moves to `envoyee` |
| `vigie-emploi prochaine-action <id> "text"` | Next action of the application (`-` to clear it) |
| `vigie-emploi lien <id> <url or ->` | Offer link |
| `vigie-emploi evenement <id> --type <type> [--le "DD/MM/YYYY HH:MM"] --resume "…" [--sens envoye\|recu] [--canal] [--interlocuteurs] [--details] [--montant 3000 --unite "€ HT"] [--jours 6] [--fichier <path>]… [--fait\|--no-fait]` | Adds an event to the journal (types: `message`, `entretien`, `test`, `proposition`, `decision`, `note`). `--le`: DD/MM/YYYY, YYYY-MM-DD, optional time, `demain`, `+3`; defaults to now. Dated in the future, it is not done: it is a deadline |
| `vigie-emploi journal <id>` | Application journal: deadlines first (overdue on top), then newest to oldest |
| `vigie-emploi echeances [--jours 7]` | Overdue deadlines and those in the next N days, across all offers |
| `vigie-emploi fait <event_id> [--no-fait]` | Marks a deadline as done (or reopens it) |
| `vigie-emploi fichiers <id>` | Files of the application folder (paths to cite in `--fichier`) |
| `vigie-emploi stats` | Applications by stage (sent, reply, interview, offer) and average delay before the first reply |
| `vigie-emploi generer-suivi [--sortie <file>] [--remplacer]` | Generates the application tracking table from the database: `candidatures/_SUIVI.genere.md` by default (preview), `candidatures/_SUIVI.md` with `--remplacer` |
| `vigie-emploi mcp` | MCP server (stdio) for an AI |
| `vigie-emploi serve [--port 4410] [--inactivite <minutes>]` | Starts the dashboard on http://localhost:4410; with `--inactivite`, it stops by itself after that long without a visit (`GET /api/sante` gives the remaining time) |

Statuses: `nouvelle`, `a-lire`, `notee`, `ecartee`, `go`, `envoyee`, `relancee`, `entretien`, `refus`, `close`, `abandonnee`. "Mes candidatures" (my applications) groups `envoyee` and the following ones.

Score format (the batch format):

```json
{
  "source": "linkedin", "url": "https://www.linkedin.com/jobs/view/1234567890/",
  "titre": "…", "entreprise": "…", "lieu": "…", "contrat": "CDI", "remuneration": "50-60 K€",
  "teletravail": "hybride", "publiee": "NC", "stack": "PHP, API",
  "criteres": {
    "technique": { "note": 8, "justification": "PHP, REST API; gap: PostgreSQL" },
    "role": { "note": 7, "justification": "…" },
    "interet": { "note": 6, "justification": "…" },
    "risque": { "note": 7, "justification": "…" }
  },
  "entrees": { "jours_sur_site": 2, "salaire_min": 55000, "salaire_max": 65000, "unite": "an" },
  "bloquants": [],
  "colle": "…", "ecarts": "…", "lu": true
}
```

With `criteres` (or `entrees`, `bloquants`), the score is **computed** with the grid; a `note` field provided is ignored and reported in `avertissements`. The response contains the score, the exact value and the breakdown. Without `criteres`, it is an overall score from the old grid (`note`, `note_brute`, `penalites`), which stays frozen. Optional fields: `id` (instead of `url`), `description`, `tags`. Descriptive fields only fill in what is missing; the latest score prevails.

### Scoring grid

The grid lives in `<data>/profil/grille.json` (generic template: [`exemples/grille.json`](exemples/grille.json), copied by `vigie-emploi grille --init`). It contains:

- **weighted criteria** (7 at most) scored from 0 to 10: by the AI (`source: "ia"`, with an instruction in `description`) or by the application (`source: "calcul"`, `calcul: "teletravail"` or `"remuneration"`); relative weights, normalised to 100%;
- **scales**: remote work (sub-score for 0 to 5 days on site, "unknown" value); pay (salary in K€/year and day rate in €/day: floor = 5, high target = 10, below the floor = 0, linear in between; optional full-remote floor; middle, low or high end of the range);
- **blocking rules**: identifier, label, effect `zero` or `plafond` (cap) + value, active or not;
- **skills inventory** (technology → strong / medium / light / none), read by the AI for the technical criterion;
- **"worth a look" threshold** (quick view "Notées ≥ …");
- **reference examples** (offers scored criterion by criterion, with justification) to calibrate the AI;
- general **instructions** for the AI.

Computation: weighted average of the sub-scores → blocking rules (zero, cap) → rounded to the half point for display and filters (the exact value is kept). Missing data (criterion not scored, remote work or salary unknown): neutral value 5 and a **flag** on the offer. Days on site and salary come from `entrees`, otherwise from the offer's remote-work and pay fields.

Each save (panel, CLI, MCP, or file edited by hand) creates a **version** (number, date, author, summary) and **recomputes all criterion-based scores**, without re-reading any offer. Old overall scores stay as they are ("ancienne grille" badge). You can go back to a previous version (it becomes a new version).

### Dashboard

`vigie-emploi serve`, then http://localhost:4410 (listens on 127.0.0.1 only). `--inactivite <minutes>` stops it after a period without activity.

Without a terminal (Claude Desktop): ask the AI to open the dashboard. The `ouvrir_tableau_de_bord` MCP tool starts it in the background if it is not already running (a separate process that survives an MCP server restart and stops after 60 minutes without activity), on the workspace's port or the next free one, and returns the address to click; `ouvrir: true` opens it in the default browser. It needs an installed `node` (24 or later); otherwise it runs inside the MCP server process, as long as Claude Desktop stays open.

- Server-side paginated table (25 to 500 rows per page), Thunderbird-style column sorting (the last header clicked becomes the primary sort, the previous one becomes secondary: click Note then Reçue le to sort by date, then by score for equal dates; the URL keeps the levels), hideable columns.
- Filters: score, received and published dates, source, status, contract, remote work, tags, full-text search (accent-insensitive). Filters live in the URL: you can bookmark it.
- Quick views: to process, scored ≥ grid threshold (4.5 by default), my applications.
- **Score settings** (header button): weight sliders (normalised total shown), threshold, remote-work and pay scales, blocking rules (enable, effect, cap, add, delete), inventory (add, edit, delete, filter), reference examples recomputed live; **preview before saving** (offers whose score changes, offers crossing the threshold, clickable); mandatory change summary; version history and restore.
- **Work for the agent**, above the filters, only when there is some: "Traiter N e-mails" (`.eml` files waiting in the inbox) and "Préparer N candidatures" (offers in `go` without a folder). Each button opens a terminal in the data folder with the agent and the `/traiter-emails` or `/preparer-go` command (provided by the data folder, for example as Claude Code skills); the rest happens in that terminal. See [ADR 0005](docs/adr/0005-boutons-agent-et-notifications.md).
- **Live updates**: the server notifies the page (Server-Sent Events, `/api/flux`) when the database changes, whatever the origin of the write (CLI, agent, another tab), and when the inbox changes; the page then reloads its data. The "Rafraîchir" (refresh) button remains available.
- **À venir** (upcoming) banner above the table: overdue deadlines and those in the next 7 days, each opening its offer; **Statistiques** button (applications by stage, reply delay).
- Details panel: description, link to the offer (editable), **score breakdown** (criterion by criterion: sub-score, weight, contribution, justification, origin; rules applied; flags; exact value and grid version), "ancienne grille" badge for an overall score, **sub-score correction** (AI criteria, days on site, salary, rules; the score is recomputed and added to the history), old-style overall score, **application** (next action, sending date, channel), **journal** (deadlines first, overdue in red; add, edit, delete an event, mark a deadline as done; link a file from the folder chosen from a list), **folder files** (links that open them), status history, editable tags, status change, **Candidater** button (copies `candidater <id>` to the clipboard and moves the offer to `go`).
- Files: served read-only through `/api/fichier/<path>`, only inside the data folder (no `..`, no hidden files, neither `data/` nor `emails/`, symbolic links resolved); Markdown rendered as simple HTML without scripts (CSP), `?brut=1` for raw text, PDFs and images as they are. The server rejects requests whose host is not `localhost` / `127.0.0.1`, and writes coming from another origin (non-local `Origin` header or `Sec-Fetch-Site: cross-site`).
- Light / dark / system theme, adjustable text size (remembered in the browser), keyboard navigation (Enter opens an offer, Escape closes the panel).

Interface development: `vigie-emploi serve` on one side, `npm run dev:ui` on the other (Vite on http://localhost:5173, the API is proxied to port 4410; `VIGIE_EMPLOI_API` to change it).

### Generated application tracking

`vigie-emploi generer-suivi` writes the tracking table in the format of the former `_SUIVI.md`: sections **En cours** (in progress: to send first, then from the latest sending to the oldest), **Envoyées sans suite** (sent without follow-up: status "no news" or "no reply"), **Closes** (refused, abandoned, closed), columns Offer, Type, Channel, Sent, Status, Next action, Folder, links to the folders. At the top: "Fichier généré par vigie-emploi le … : ne pas éditer à la main" (generated file, do not edit by hand).

Next action column: the next deadline in the journal ("**04/11** : Relancer", "(en retard)" if the date has passed), otherwise the `prochaine_action` field.

As long as an application has not changed since the import, its cells are rewritten as they were; afterwards the Status column shows the comment of the latest status. The next action entered in the interface, the CLI or through MCP is never overwritten by a new import of the old `_SUIVI.md`.

Switch-over: compare `_SUIVI.genere.md` with `_SUIVI.md`, then `vigie-emploi generer-suivi --remplacer`. After the switch-over, the database prevails.

### Journal and deadlines

**The database knows what happened and when; the Markdown folder keeps the documents.** An event has a type, a date (or date-time), a summary, and if needed: direction (sent / received), channel, contacts, amount + unit, days, details, files (paths relative to the data folder). A future date not done is a deadline; past and not done, it is overdue.

Import (`import-historique`): the "Suivi" sections of active folders (`candidatures/*/dossier-candidature.md`, not `_archives/`) become events with origin `import`: Date | Event table rows, dated bullets "- 13/10/2026 — …", dated checked boxes "- [x] Envoyée le : 13/10/2026". Unchecked boxes (to do) are not imported. Guessed type (message, interview, test, offer, decision; `note` by default, listed in the report), relative Markdown links and backquoted paths to existing files. Idempotent: one fingerprint per line; a line removed from the folder removes the imported event if it has not been modified since. A folder that no application points to is attached to the application without a folder whose company appears in its name (if unique).

An offer already being followed (`go` and beyond) seen again in an e-mail alert, a scored batch or the register no longer changes status; the alert leaves a trace in the journal ("Revue le …", one per day).

### Development

```sh
npm test            # Vitest (fictitious fixtures in tests/fixtures)
npm run typecheck   # TypeScript (server + interface)
npm run build       # typecheck + interface build
npm run mcpb        # Claude Desktop extension: build/vigie-emploi-<version>.mcpb
```

Layout:

```
bin/vigie-emploi.js   command entry point (TypeScript from src/ in the repository, JavaScript from dist/ in the npm package)
migrations/         versioned SQL schema (PRAGMA user_version)
src/core/           configuration, links, normalisation, offer operations, queries,
                    scoring grid (grille.ts: pure schema and computation; grille-stockage.ts: file, versions, re-scoring)
exemples/           sample scoring grid (generic)
src/db/             database opening and migrations
src/ingest/         .eml reading, JSON-LD, ingestion
src/import/         import of the Markdown / JSON history (including folder journals)
src/cli/            commands
src/api/            HTTP server (Hono): JSON API, data folder file reading, built interface
src/mcp/            MCP server (stdio), tools wired to src/core
src/export/         application tracking generation (Markdown)
ui/                 React 19 + Vite + Tailwind CSS v4 + TanStack Table / Query interface
docs/adr/           architecture decisions (in French)
```

See also [`AGENTS.en.md`](AGENTS.en.md) (driving by an AI; French original: [`AGENTS.md`](AGENTS.md)), [`docs/utiliser-avec-une-ia.md`](docs/utiliser-avec-une-ia.md) (connecting the MCP server) and the architecture decisions in [`docs/adr/`](docs/adr/) (in French).

## License

Code under the MIT license (see `LICENSE`). Résumé template fonts under the SIL Open Font License: Amiri ("sobre" template) and Source Sans 3 ("moderne" and "compact" templates); license text in each template's `fonts/` folder.
