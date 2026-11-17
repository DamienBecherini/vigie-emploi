# Driving vigie-emploi from an AI

This file is for an agent (Claude Code or another) that helps the user sort their job ads. The application contacts no AI model: the agent reads, scores and reports back, and the application keeps the state. Work and write in English with the user; the names of the commands, options, MCP tools, parameters and statuses are identifiers: use them as they are.

Two ways to drive it: the **MCP tools** (`vigie-emploi mcp`, preferred when the MCP client is connected, see [`docs/utiliser-avec-une-ia.md`](docs/utiliser-avec-une-ia.md)) or the **CLI** with `--json`. Both call the same core.

## Rules

- CLI: always pass `--json`: the output is stable and unambiguous. Errors go to stderr (`{"ok": false, "error": "…"}`) with a non-zero exit code. MCP: an error comes back as an error result (`isError`), and the server keeps running.
- `_SUIVI.md` (the tracker) is generated from the database (`generate_tracker` / `vigie-emploi generate-tracker`): once the user has switched to it, do not edit it by hand. By default it writes the preview `candidatures/_SUIVI.genere.md`; use `replace` only if the user asks for it.
- The data folder comes from `VIGIE_EMPLOI_DATA`, `--data` or `vigie-emploi.config.json`. Never write personal data into the application's repository.
- Do not download LinkedIn, Indeed or Glassdoor pages with a script: read them in the user's browser, or ask them for the text (Glassdoor blocks bots). The Hellowork and Free-Work descriptions are already in the database after `ingest`.
- The scoring grid belongs to the user (`profil/grille.json` in their data folder): read it before scoring a batch (`rubric` over MCP, `vigie-emploi rubric --instructions --json` on the CLI). Never give the final score: score the criteria, and the application calculates it.
- Only change the grid (`update_rubric`, `vigie-emploi rubric --update`) when the user asks: first a trial run (`dry_run: true` / `--dry-run`) whose impact you show them, then save it with a summary.

## Full flow over MCP

1. **Ingest**: `ingest_emails` (`keep: true` to keep the `.eml` files). Note `added`, `duplicates`, `dismissed` (discarded), `to_read` and `errors`.
2. **Read**: `offers_to_read`. Depending on `reading`: text in `description`; `browser` = open `url` in the user's browser; `human` = ask them for the text. `read_offer` for the full details.
3. **Score** with the grid: `rubric` first (criteria, weights, scales, rules, inventory, examples, `instructions_ai`), then `score_batch` (`{ "offers": [ {id, criteria, inputs, blockers, fit, gaps, read, tags}, … ] }`) or `score_offer` for a single one. See "Scoring with the grid" below. Seen before? `list_offers` with `text`.
4. **Summarise** for the user: job ads scored, those above their threshold (the grid's), with the breakdown (sub-scores, rules, "unknown" flags to check), conditions, what matches, gaps. No "go": `change_status` to `dismissed`, with the reason as the comment.
5. **Apply** on their "go": `apply` (full job ad, data folder, `suggested_folder`, steps). Prepare the application file, the CV and the messages following their instructions (in the data folder).
6. **Record the application**: `save_application` with `folder`, `cv`, `channel`, `message`, `next_action`; once sent, `sent_at` (the job ad moves to `sent`). After that: `change_status` (`followed-up`, `interview`, `rejected`, `closed`, `withdrawn`) and `save_application` for the next action.
7. **Keep the log** (see below): each exchange becomes an event, and what comes next a deadline.
8. **Generate the tracker**: `generate_tracker` → `candidatures/_SUIVI.genere.md` (sections In progress, Sent with no reply, Closed; the next action comes from the next deadline).

## Scoring with the grid

1. Read the grid (`rubric`). Criteria with `source: "ai"` are scored from 0 to 10 with a short justification; their `description` says what to look at. The technical criterion is judged against the inventory (`strong` / `medium` / `light` / `zero`): list the gaps. Calibrate your sub-scores on the `examples`.
2. Do not score the calculated criteria (`remote`, `compensation`): fill in `inputs` when the job ad gives them (`onsite_days` 0 to 5, 0 = fully remote; `salary_min` / `salary_max` as plain amounts in the grid's currency; `unit`: `year`, `month`, `day` or `hour`). Otherwise the application reads them from the job ad's fields; when unknown, they are worth 5 with a flag.
3. `blockers`: ids of the active rules that apply (internship, defence…). An unknown rule is refused.
4. Do not send `score`: with `criteria`, it is ignored (reported in `warnings`). The response gives the calculated score, the exact value and the `breakdown`.
5. Trial run available: `score_batch` with `dry_run: true` (CLI `score --file lot.json --dry-run`) calculates without saving anything.
6. Changing priorities ("remote work matters more", "£50K is enough for me"): `update_rubric` as a trial, show the impact (`rising`, `falling`), then save with a `summary`; every criteria-based score is recalculated. Going back: `update_rubric` with `restore_version`. History: `rubric_history`.

Sample entry:

```json
{ "id": 42,
  "criteria": { "technique": { "score": 8, "justification": "PHP, REST APIs; gap: PostgreSQL (none)" },
                "role": { "score": 7, "justification": "Senior, no lead role" },
                "interet": { "score": 6, "justification": "SaaS for small businesses" },
                "risque": { "score": 7, "justification": "Test on an existing project" } },
  "inputs": { "onsite_days": 2, "salary_min": 55000, "salary_max": 65000, "unit": "year" },
  "blockers": [], "fit": "…", "gaps": "…", "read": true }
```

## Log: when the user reports a call, an interview, a message, a quote

1. **The event**: `add_event` (CLI: `vigie-emploi event <id> …`) with the type (`message`, `interview`, `test`, `proposal` = offer or quote, `decision`, `note`), the actual date (`at`), a short summary, and whatever is known: `direction` (`sent` or `received`, for a message), `channel`, `contacts`, `amount` + `unit` and `days` for a quote, `details`.
2. **Any document** (meeting notes, quote, call sheet): write it in the application folder (`candidatures/<company-role>/…`), then reference it in `files` (path relative to the data folder; `folder_files` lists the existing ones). Never copy a document's content into the database.
3. **The next deadline**: a second `add_event` dated in the future (`done: false`), for example "Follow up if no news" at D+7, "Technical interview" on the planned date.
4. A deadline that has been dealt with: `mark_done`, then the event for what happened. A change of stage remains a status (`change_status`: `followed-up`, `interview`, `rejected`…).
5. At the start of a session: `deadlines` (overdue items and the next 7 days) to tell the user what lies ahead.

A job ad already being followed that reappears in an alert or a batch keeps its status: do not rescore it or change its status because of that.

## "Process the e-mails" flow (CLI)

1. `vigie-emploi ingest --json`: reads `<data>/emails/*.eml`, adds the new job ads, deletes the processed e-mails. Note `added`, `duplicates`, `dismissed`, `to_read` and `errors`.
2. `vigie-emploi to-read --json`: job ads to process without a score. `reading` field:
   - `description`: the description is in the `description` field (truncated at 2,500 characters; `--full` for all of it);
   - `browser`: open `url` in the user's browser;
   - `human`: protected page, ask the user for the text.
3. Read the grid (`vigie-emploi rubric --instructions --json`), then read each job ad and score its criteria.
4. Write a batch file (JSON array, format below) then `vigie-emploi score --file lot.json` (`--dry-run` to check without saving). Job ads are found by `id` or `url`; they move to `scored`.
5. Summarise for the user: job ads scored, those above their threshold with conditions, what matches and the gaps.
6. Depending on their answer:
   - "go": `vigie-emploi apply <id> --json` (moves to `go`, returns the full job ad and a suggested folder);
   - no go: `vigie-emploi status <id> dismissed --comment "reason"`.

Format of a batch entry:

```json
{
  "id": 42,
  "url": "https://www.linkedin.com/jobs/view/1234567890/",
  "title": "…", "company": "…", "location": "…", "contract": "…", "compensation": "…",
  "remote": "…", "published": "DD/MM/YYYY or NC", "stack": "…",
  "criteria": { "technique": { "score": 8, "justification": "…" }, "role": { "score": 7 }, "interet": { "score": 6 }, "risque": { "score": 7 } },
  "inputs": { "onsite_days": 3 }, "blockers": [],
  "fit": "…", "gaps": "…", "read": true, "tags": ["wordpress"]
}
```

`id` or `url` is enough; the other fields fill in what is missing from the database. Old format (overall score, without `criteria`): `"raw_score": 6.5, "penalties": "…", "score": 6`, still accepted but frozen.

## Other useful commands

| Need | Command |
|---|---|
| Seen before? | `vigie-emploi list --text "company" --json` |
| Best unprocessed job ads | `vigie-emploi list --status scored --score-min 5 --sort score --json` |
| By batch received, best scores first | `vigie-emploi list --status scored --sort received_at:desc,score:desc --json` |
| My applications | `vigie-emploi list --applications --json` |
| Details of a job ad | `vigie-emploi show <id> --json` |
| Application (folder, channel, date sent, next action) | `vigie-emploi application <id> --folder candidatures/x --channel LinkedIn --sent-at 02/11/2026 --next-action "…" --json` |
| Next action only | `vigie-emploi next-action <id> "Follow up on 09/11" --json` |
| Follow-up, interview, rejection | `vigie-emploi status <id> followed-up --comment "channel, date"` |
| Application tracker | `vigie-emploi generate-tracker --json` (preview `candidatures/_SUIVI.genere.md`) |
| Tags | `vigie-emploi tag <id> +a-reprendre -urgent --json` |
| Event (call, quote…) | `vigie-emploi event <id> --type proposal --at 15/10/2026 --summary "Quote sent via Upwork" --direction sent --amount 3000 --unit "£" --days 6 --file candidatures/x/quote.md --json` |
| Deadline | `vigie-emploi event <id> --type message --at +7 --summary "Follow up if no news" --json` |
| Log, deadlines | `vigie-emploi journal <id> --json`, `vigie-emploi deadlines --days 7 --json`, `vigie-emploi done <event_id> --json` |
| Files in the folder | `vigie-emploi files <id> --json` |
| Single score | `vigie-emploi score <id> --json '{"criteria": {"technique": {"score": 8, "justification": "…"}, …}, "fit": "…", "gaps": "…"}'` |
| Grid, instructions | `vigie-emploi rubric --instructions --json` |
| Change a weight (trial, then for real) | `vigie-emploi rubric --update '{"weight": {"remote": 30}}' --dry-run --json`, then `--summary "Remote work first"` |
| History, going back | `vigie-emploi rubric --history --json`, `vigie-emploi rubric --restore 2 --json` |
| Recalculate | `vigie-emploi rescore --json` |

The dashboard's "Process N e-mails" and "Prepare N applications" buttons open a terminal in the data folder and start the agent with `/traiter-emails` or `/preparer-go`: these commands come from the data folder (the user's instructions); follow them as if the user had typed them. The dashboard updates itself as things are written.

The dashboard's "Apply" button copies `apply <id>`: when the user pastes that text, run `vigie-emploi apply <id> --json` and prepare the application following their instructions.

## Developing on this repository

- `npm test` and `npm run build` must pass before each commit.
- Fictitious fixtures only (`tests/fixtures`): never real e-mails or real job ads.
- Schema: add a migration `migrations/000N_name.sql`; never change a migration that has already been published.
- The code (identifiers, comments, tests) is in English; the documentation is written in French, and `AGENTS.en.md`, `README.en.md` and `scaffold-en/` are its English versions.
