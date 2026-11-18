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

### Development

- Lint and formatting with Biome (`npm run lint`, `npm run format`), coverage of `src/` with a floor (`npm run coverage`), `npm run check` for everything the CI runs.
- Tests of the command-line interface, of the documentation's links and of the lockfile.

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
