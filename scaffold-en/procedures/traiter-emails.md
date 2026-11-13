# Procedure: process the job alert e-mails

Triggers: "process the e-mails", "look at the new job ads", "Process e-mails" button of the dashboard.
The application's reference: `{{DOC_APP}}`. This sheet sets the order and the known pitfalls.

Tools: the application's MCP server (`ingest_emails`, `offers_to_read`, `rubric`, `score_batch`, `change_status`, `list_offers`, `read_offer`), otherwise the CLI `{{CMD}} <command> --json`. Without file access: `read_file` for `_CONTEXTE.md` (see `AGENTS.md`). Read the JSON output directly, without passing it through another program.

## 0. Browser

A connected browser (Claude in Chrome or similar) lets you read the LinkedIn, Indeed and Glassdoor job ads. If you do not see one, first check `_CONTEXTE.md` (section 9): if the user said they have one, ask them to enable it in this conversation (Claude Desktop: tools menu); if it has never come up, suggest it once. If none is available: tell the user straight away, deal first with the ads whose description is already in the database, then ask them for the text of the others (or to run the procedure again with the browser).

## 1. Ingest

`ingest_emails`. Report in one sentence: new job ads, duplicates, ads discarded on their title, ads to read. Then pass on to the user what `to_tell` says: **the processed `.eml` files have been deleted from `emails/`** (they need to know), and every ingestion error (`errors`: description not read, page without "JSON-LD" data, unreadable link…), with the job ad concerned; a description that could not be read does not stop you reading the ad in the browser.

**Application acknowledgements** (`confirmations` in the result: "Your application has been submitted", "Thank you for applying"…): these are not job ads. For each one, check that the application is recorded as sent (`offres_connues`); otherwise point it out to the user and record it with them (`save_application` with `sent_at`). Never present them as new job ads. **E-mails not deleted** (error "e-mail read but not deleted"): point it out, they would come back with the next batch.

## 2. Take stock of the batch

`offers_to_read` returns a summary in pages of 25 (id, title, company, location, `reading`, `length_description`); if `remaining` > 0, ask for the next page (`page`). `reading` is `description` (text already in the database), `browser` (open the URL) or `human` (ask for the text). Then read **one job ad at a time** with `read_offer` (id) and score them in batches. On the CLI: `{{CMD}} to-read --json`.

## 3. Discard on the title

Without reading them, whatever is clearly off target given `_CONTEXTE.md` (occupation, main technology at level none, country, internship…). `change_status` → `dismissed`, comment: `Discarded on title (batch of DD/MM): <reason>`.

## 4. Score

1. `rubric` first: criteria, scales, rules, inventory, examples.
2. For each job ad read: sub-scores for the `ai` criteria with a short justification, `inputs` (days on site, salary or day rate and its unit), `blockers` (the grid's rules), `fit` (what matches), `gaps` (gaps), `read: true`. **Never give the final score**: the application calculates it.
3. A single `score_batch` per batch of job ads.
4. A job ad set to 0 by a blocking rule then goes to `dismissed`, with the rule as the comment.

## 5. Read in the browser

A tab of your own, a few ads at a time, the description only (not the whole page). Known pitfalls:

- **LinkedIn**: readable when logged in; loading it with a script is refused. A job ad "no longer accepting applications" or a page not found: `dismissed` ("job closed"), without presenting it.
- **Indeed**: prefer the direct URL `https://<country>.indeed.com/viewjob?jk=…` (for example `uk.indeed.com`); the tracking link in the e-mail triggers an anti-bot check.
- **Glassdoor**: wait for the page to load, keep the text from "Description" onwards. A "human" verification page: do not get around it, ask the user.
- **Hellowork, Free-Work** (French sites): the description is normally already in the database.
- Duplicate of a job ad already in the database: `dismissed` ("duplicate of #id").

Close the tab at the end, then `score_batch` for these ads.

## 6. Report back

A table of the job ads above the grid's threshold, best first: score, no., company, title, location, pay, why, points to check, **full link**. Flag misleading scores (an ad that only climbs thanks to remote work, for example). One line for those just below.

End with: "Tell me which job ads get a go; the others will be discarded." On their answer: the ads without a go go to `dismissed` (reason as the comment), then offer to prepare the applications (`prepare-go` procedure).

If the workspace is under version control with git: commit the database (`data/vigie-emploi.sqlite`) with a message such as "Batch of DD/MM: N job ads, X discarded, Y scored".
