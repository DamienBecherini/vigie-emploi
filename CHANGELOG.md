# Changelog

## 0.7.0 — unreleased

### Security

- Mailbox without direct TLS (port 143): encryption (STARTTLS) is now required before the password is sent; a server that does not offer it is refused instead of receiving the password in clear text. Only a server on the same machine (local gateway) can do without it.
- Dashboard: a symbolic link placed in the workspace no longer gives access to `data/` or `emails/`.
- Scoring an offer by its address: only http(s) addresses are accepted, as when editing the link.
- Résumés: the HTML page rendered by Chrome for the PDF forbids any script, any connection and any frame (a job ad text copied into a résumé cannot run anything).

### Languages

- A new workspace takes the system's language: `init` without `--language` (and the Claude Desktop extension with the language left empty) creates it in French on a French system, in English otherwise. `--language fr` or `--language en` still forces one. A workspace whose configuration file names no language stays French, as before.
- English is now the reference language of the shipped files: `scaffold/`, `AGENTS.md` and `examples/rubric.json` are the English versions; the French ones are `scaffold-fr/`, `AGENTS.fr.md` and `examples/rubric.fr.json`. A language without its own translation falls back on English.

### Documentation

- English first: `README.md` is in English and `README.fr.md` in French; the same rule applies in `docs/`.
- The reference (installation, configuration, commands, scoring grid, dashboard) moved from the README to `docs/reference.md`.
- Guides renamed: `docs/mcp.md` (was `docs/utiliser-avec-une-ia.md`) and `docs/adding-a-language.md` (was `docs/ajouter-une-langue.md`), each with its `.fr.md` version; architecture decisions (`docs/adr/`) and this changelog translated to English.
- For developers: `docs/code.md` explains how the code fits together (modules, data, score, the three ways in, job sites, choices), `CONTRIBUTING.md` says what a change must come with, and ADR 0006 records the decisions of this redesign. Each exists in French (`.fr.md`).

### Errors

- The API answers with the status of the error: 404 for what does not exist (it was 400), 400 for a wrong input, 403 for a refused access, and 500 for a defect of the program (it was 400 too), whose stack goes to the error output. Each error answer carries a `code` (`not-found`, `invalid`, `forbidden`…) next to its message.
- The command line gives the same `code` in its JSON errors (`--json`), and `import-history` without a `candidatures/` folder now says so in one translated line instead of a stack.

### Inputs

- The API validates the body of each request: a field of the wrong type is refused with 400 and its name, before anything is written.
- A score has one definition for the command line, the API and the MCP server. A text field may be `null` everywhere (an AI often writes `null` for what the job ad does not say), and a field of the wrong type is refused with its name.
- The configuration file is validated: a key of the wrong type, a file that is not JSON, an invalid exclusion pattern or an invalid `VIGIE_EMPLOI_PORT` now give one line naming the file and the key. A wrong port used to be read as "not a number" without a word.

### Languages in the data

- A score no longer saves French sentences. Its flags (remote work unknown, pay unknown or below the floor, criterion without a sub-score) are saved as a code and its values, and written in the language of whoever reads them: dashboard, command line, MCP server. Scores saved earlier keep their message and still read in both languages.
- In an English workspace, the summary of the applied rules ("cap 6.5: …"), the contract kinds read from job ads ("Permanent", "Fixed term / temp"), the "known-company" tag and the page that shows a file of the workspace are in English.
- Moving a job ad to "sent" clears a next action that was to send the application whatever the language ("Envoyer…", "Send…"); it only knew the French verb.
- `ingest`: an application acknowledgement now lists the job ads it refers to (the line showed the placeholder `{suite}` instead).

### Job sites

- Indeed and Glassdoor: the address saved for a job ad keeps the country site of the link received (`uk.indeed.com`, `www.glassdoor.co.uk`…) instead of always the French one. A job ad is still recognised by its site and its identifier, so nothing changes for the ads already saved, and the same ad seen on two country sites stays one ad.
- Collective: the contract and the work pattern read in the page follow the language of the workspace ("Fixed term", "on site"), as does the "yes" of a remote job read on Hellowork or Free-Work.
- A work pattern written in English is understood by the score: "3 days on site", "2 days from home", "2 days per week in the office".
- Free-Work: a description that contains "Bienvenue chez" is no longer cut there (the cut is for Hellowork, which repeats the presentation of the company).

### Fixes

- `score` and `rubric --update` accept `--dry-run`, the spelling of the help (`--dry_run` still works).
- `template` run twice within the same second keeps both old templates (`cv/gabarit-<date>-2`…) instead of failing.
- `deadlines --days abc`, `mail setup --port abc` and `mail setup --since-days abc` give one line naming the option and what was typed, instead of going on with "not a number".
- `vigie-emploi toString` (or any name inherited by a JavaScript object) is an unknown command, not a silent success.
- An option a command does not have is named in one line, in the language of the workspace ("Option inconnue : --limit"), instead of a long English sentence.
- `tag` reads `--data=<folder>` and `--config=<file>` like the other commands, and refuses `--data` or `--config` without a value instead of ignoring it.
- The command line shows the stack of a defect of the program (an unexpected error) instead of its message alone; the errors it expects (a wrong input, something missing) still show their message alone.

### Development

- One adapter per job site in `src/sources/` (link recognition, who reads the ad, page reading, e-mail particularities), listed in one registry: adding a site is one file, one line and one block of tests.
- The five largest files are split by domain, without any change of behaviour: commands of the command line (`src/cli/commands/`), routes of the API (`src/api/routes/`), tools of the MCP server (`src/mcp/tools/`), scoring grid (`src/core/rubric/`), components and hooks of the interface.
- Lint and formatting with Biome (`npm run lint`, `npm run format`), coverage of `src/` with a floor (`npm run coverage`), `npm run check` for everything the CI runs.
- Tests of the command-line interface, of the documentation's links and of the lockfile.
- The reading of the cells of the history tables moved from `src/import/history.ts` to `src/import/cells.ts`; a test keeps the files of `src/` under 500 lines and the comments in English. No test reads the real `~/vigie-emploi` any more.

## 0.6.0 — November 2026 (first public release)

First published version: everything below is new for anyone installing it.

### Job alerts

- **Built-in mailbox fetching (IMAP)**: the application itself fetches the folder where a mail filter files the job alerts, on Windows, macOS and Linux, without any mail client. Read-only (messages marked as read at most, nothing deleted or moved), each message fetched once, first fetch limited to the last 14 days.
- Mailbox password kept by the system, never in the workspace: DPAPI on Windows, macOS keychain, Secret Service on Linux (failing that, a file readable by the user only); `VIGIE_EMPLOI_MAIL_PASSWORD` for scripts and the Claude Desktop extension.
- Mail providers recognised from the address: Gmail, Yahoo, iCloud (app password); Orange, Free, SFR, La Poste, GMX (usual password). Outlook.com and Microsoft 365 are not supported yet (Microsoft imposes its own sign-in): forward the alerts to another mailbox in the meantime.
- `vigie-emploi mail setup|status|fetch|forget`; `ingest` fetches the mailbox first (`--no-mail` to skip it); the MCP tool `ingest_emails` says what was fetched, or why the mailbox was not.
- Dashboard: "Mailbox" panel (connection, list of folders, immediate fetch, forget) and "Fetch the mailbox" button.
- `.eml` files dropped into `emails/` (by hand, by Thunderbird and FiltaQuilla, or by any other rule) are still read.

### Installation

- `init` without a folder creates `~/vigie-emploi` (`~` also understood in PowerShell); the Claude Desktop extension and the MCP server use the same folder by default.
- A single prompt pasted into Claude Code installs the application and starts the onboarding in the same session.
- Claude Desktop extension (`.mcpb`): one click, no terminal and no Node to install.

### Everything else

- Offer triage by the AI with a transparent and adjustable scoring grid: weighted criteria, remote-work and pay scales, blocking rules, skills inventory, reference examples, versions and restoring; the application computes the score, the AI only scores the criteria.
- Applications, journal and deadlines; generated tracker (`candidatures/_SUIVI.md`); statistics.
- Résumés in Markdown → two-page A4 PDF, three templates (`plain`, `modern`, `compact`).
- Web dashboard, CLI with stable JSON output, MCP server (33 tools, 4 prompts) usable without file access (Claude Desktop).
- French and English everywhere (interface, CLI, MCP texts shown to the user, AI instructions, workspace template).
- Tests on Linux, Windows and macOS (GitHub Actions).
