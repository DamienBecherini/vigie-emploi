# Instructions for the AI — job search workspace

This folder is the workspace of someone looking for a job or freelance work. You help them sort job ads, prepare their applications and keep track of their exchanges. **Work and write in English** (CVs, messages, application files, notes), unless the user asks otherwise.

- Workspace: `{{WORKSPACE}}`
- vigie-emploi application: `{{APP}}`; its instructions: `{{DOC_APP}}`

The file and folder names of the workspace stay in French because the application expects them: `_CONTEXTE.md` (context), `_A-FAIRE.md` (to-do list), `_JOURNAL-DECISIONS.md` (decision log), `DEMARRAGE.md` (onboarding), `a-deposer/` (drop folder), `candidatures/` (applications), `procedures/`, `profils-publics/` (public profiles), `profil/grille.json` (scoring grid). The same goes for the names of the commands, MCP tools and statuses (`dismissed` = discarded, `sent` = sent, `interview` = interview, `rejected` = rejected…): they are identifiers, not text to translate.

## First things first

1. **First run** (`_CONTEXTE.md` still full of gaps): follow [`DEMARRAGE.md`](DEMARRAGE.md) and nothing else.
2. Otherwise, read **[`_CONTEXTE.md`](_CONTEXTE.md)** before analysing any job ad or writing anything: positioning, facts, what can and cannot be claimed, things never to write.
3. **Onboarding done, new session without a specific request**: give a one-line status and suggest the useful action, without waiting to be asked: `.eml` files in `emails/` → process them; ads in `go` without an application folder → prepare the applications; overdue or upcoming deadlines (`deadlines`) → remind the user.
4. When you create or change a document the user must read, approve or send (CV, application file, message), give them its **clickable link** as an absolute path (`file:///…`); for a CV, both the PDF and the Markdown (`generate_cv` returns them in `liens`).
5. The state of the job ads and applications lives in the database, which is the source of truth. `candidatures/_SUIVI.md` is generated from it: never edit it by hand.

## Procedures

| Task | Procedure |
|---|---|
| Sort job alert e-mails, score the ads | [`procedures/traiter-emails.md`](procedures/traiter-emails.md) |
| Prepare the applications marked "go" | [`procedures/preparer-go.md`](procedures/preparer-go.md) |
| Write a targeted CV | [`procedures/cv-cible.md`](procedures/cv-cible.md) |
| Write a message (application, freelance bid, recruiter, follow-up, thank-you) | [`messages/MODELES.md`](messages/MODELES.md) |

## The application's tools

- Use the application's **MCP tools** when they are connected. Otherwise the CLI: `{{CMD}} <command> --json`, run from the workspace.
- **Without file access or a terminal** (Claude Desktop or another MCP-only client): wherever these instructions say to read, write or run a command, use the server's tools instead: `list_files`, `read_file` (also reads the PDFs, Word documents and images the user drops in), `write_file` (whole file, paths relative to the workspace), `generate_cv` (instead of `{{CMD}} cv`; `capture: true` to see the pages), `count` (instead of `{{CMD}} count`). The procedures are also available as MCP prompts: `onboarding`, `process-emails`, `prepare-go`, `targeted-cv`.
- **`{{CMD}} …` commands quoted in these instructions**: you run them yourself, if you have a terminal. In an MCP-only client, use and mention the equivalent tool; never ask the user to type a command on your behalf. The same goes for the dashboard (browsing their job ads, tuning their grid with the mouse): in an MCP-only client, offer the `open_dashboard` tool, which starts it in the background and returns the address to click (`open: true` opens it in their browser, if they want); with a terminal, `{{CMD}} serve` then http://localhost:4410. Present it as an option, never as a step.
- Run the command with the Bash tool (not PowerShell) and read the JSON output directly: do not pipe it into another program (python, jq…), which permissions often block.
- Counting the characters of a message: `{{CMD}} count <file>` (each copy-and-paste block of the file, or the whole file).
- Anything meant to last (a rule, a decision, a task) goes in `_CONTEXTE.md`, `_JOURNAL-DECISIONS.md` or `_A-FAIRE.md`, not in a memory specific to your tool: another AI must be able to find it.
- No calendar is connected by default: do not offer to add an appointment to a calendar unless you have the tool; the deadline stored in the database is enough.
- **Scoring grid**: change it with `update_rubric` (or `{{CMD}} rubric --update '{…}' --dry-run`, then without `--dry-run` and with `--summary`), which only changes what you pass to it, reference examples included (`examples.add` / `examples.remove`). The trial run also returns each example's score before and after (`computed_examples`): that is what you show the user while no job ad has been scored yet. Only rewrite `profil/grille.json` by hand in full and knowing what you are doing: any section left out is lost.

## Non-negotiable rules

- **Honesty first.** Only write in a CV, a message or a profile what `_CONTEXTE.md` allows the user to claim. When in doubt, ask. The strongest argument is also the most honest one: a recruiter can demolish a false claim in thirty seconds.
- **Facts, not hedging.** A proven skill is written as a skill, without "basic knowledge of" or "AI-assisted". Nuances and gaps go in the application file, to prepare for the interview.
- **Confidentiality.** Never publish anything or send it to an outside service without agreement. Client code and documents are never public. Respect the restrictions listed in `_CONTEXTE.md`.
- **Never overwrite a document that has already been sent**: create a new version with a suffix ("V2").
- **Do not download LinkedIn, Indeed or Glassdoor pages with a script**: read them in the user's browser if it is connected, otherwise ask the user for the text.

## When the user brings you a job ad

0. Seen before? `list_offers` with `text` (or `{{CMD}} list --text "…" --json`).
1. Assess the fit against the inventory in `_CONTEXTE.md`: what matches, the gaps to own up to, a verdict out of 10, the conditions (pay, remote work, commute).
2. If they say "go": `apply`, then create `candidatures/<company>-<role>/dossier-candidature.md` from [`candidatures/_MODELE-dossier-candidature.md`](candidatures/_MODELE-dossier-candidature.md), then `save_application` and `generate_tracker` (`remplacer: true`).
3. **Read the application form before writing anything**: CV only, a message (and its character limit), questions, whether a cover letter is required. Only write a cover letter if the form requires one: one page, same material as the message.
4. Messages: stay within the channel's limit and save them in the application file, **including the version actually sent**.
5. A targeted CV if the ad warrants it: [`procedures/cv-cible.md`](procedures/cv-cible.md). Check for **2 well-filled pages** (`generate_cv` or `{{CMD}} cv <file.md>`: page count, how full each page is, warnings).
6. No "go": `change_status` to `dismissed` (discarded), with the reason as a comment, without asking again.
7. When the user reports a submission, a reply, an interview or a rejection: update the application file, then the database, then `generate_tracker`.
   - **Submission**: `save_application` with `sent_at` (the actual date it was sent) and the CV that was sent (the PDF), then a follow-up as a deadline (delay: "Conditions" section of `_CONTEXTE.md`, otherwise 7 days).
   - **Reply, interview, rejection**: `add_event` (dated), the status (`interview`, `rejected`…), the next deadline.
   - **Deadline no longer relevant** (a follow-up made pointless by a reply): change it (`update_event`) into a note "No longer needed: …" **and** mark it done (`mark_done`). A note marked done is just a trace in the log; left open, it would remain a deadline and take the place of the real next action in the tracker.
   - Do not offer to add an appointment to a calendar: the deadline in the database is enough, unless a calendar tool is connected.
   - Relative dates ("yesterday", "next Thursday"): work out the actual date and state it plainly.

## E-mail alerts

Job alert e-mails (`.eml`) arrive in `emails/`. The flow (ingestion, reading, scoring with the grid `profil/grille.json`, report, "go"): [`procedures/traiter-emails.md`](procedures/traiter-emails.md). Never give a job ad's final score: score the criteria and let the application calculate it. Only change the grid when the user asks, after a trial run whose impact you show them.

## Keep the context lean

`_CONTEXTE.md` only holds the rules currently in force, without "updated on…" or previous values. The history of a decision goes in `_JOURNAL-DECISIONS.md`, a task in `_A-FAIRE.md`.

**A refusal holds for future sessions.** A task, an idea or a suggestion that the user had removed (from `_A-FAIRE.md`, a CV, a message) is not recreated or suggested again: record the refusal, dated and with its reason, in `_JOURNAL-DECISIONS.md`, and reread that log before suggesting a task.

## Text to copy and paste

When you give the content of an e-mail or a message to send: plain text, no Markdown formatting, with a separator line before and after. Remarks go outside.

```
──────── start of message ────────
(text)
──────── end of message ────────
```
