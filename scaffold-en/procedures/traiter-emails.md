# Procedure: process the job alert e-mails

Triggers: "process the e-mails", "look at the new job ads", "Process e-mails" button of the dashboard.
The application's reference: `{{DOC_APP}}`. This sheet sets the order and the known pitfalls.

Tools: the application's MCP server (`ingerer_emails`, `offres_a_lire`, `grille`, `noter_lot`, `changer_statut`, `lister_offres`, `lire_offre`), otherwise the CLI `{{CMD}} <command> --json`. Without file access: `lire_fichier` for `_CONTEXTE.md` (see `AGENTS.md`). Read the JSON output directly, without passing it through another program.

## 0. Browser

A connected browser (Claude in Chrome or similar) lets you read the LinkedIn, Indeed and Glassdoor job ads. If you do not see one, first check `_CONTEXTE.md` (section 9): if the user said they have one, ask them to enable it in this conversation (Claude Desktop: tools menu); if it has never come up, suggest it once. If none is available: tell the user straight away, deal first with the ads whose description is already in the database, then ask them for the text of the others (or to run the procedure again with the browser).

## 1. Ingest

`ingerer_emails`. Report in one sentence: new job ads, duplicates, ads discarded on their title, ads to read. Then pass on to the user what `a_dire` says: **the processed `.eml` files have been deleted from `emails/`** (they need to know), and every ingestion error (`erreurs`: description not read, page without "JSON-LD" data, unreadable link…), with the job ad concerned; a description that could not be read does not stop you reading the ad in the browser.

**Application acknowledgements** (`confirmations` in the result: "Your application has been submitted", "Thank you for applying"…): these are not job ads. For each one, check that the application is recorded as sent (`offres_connues`); otherwise point it out to the user and record it with them (`enregistrer_candidature` with `envoyee_le`). Never present them as new job ads. **E-mails not deleted** (error "e-mail read but not deleted"): point it out, they would come back with the next batch.

## 2. Take stock of the batch

`offres_a_lire` returns a summary in pages of 25 (id, title, company, location, `lecture`, `longueur_description`); if `restantes` > 0, ask for the next page (`page`). `lecture` is `description` (text already in the database), `navigateur` (open the URL) or `humain` (ask for the text). Then read **one job ad at a time** with `lire_offre` (id) and score them in batches. On the CLI: `{{CMD}} a-lire --json`.

## 3. Discard on the title

Without reading them, whatever is clearly off target given `_CONTEXTE.md` (occupation, main technology at level none, country, internship…). `changer_statut` → `ecartee`, comment: `Discarded on title (batch of DD/MM): <reason>`.

## 4. Score

1. `grille` first: criteria, scales, rules, inventory, examples.
2. For each job ad read: sub-scores for the `ia` criteria with a short justification, `entrees` (days on site, salary or day rate and its unit), `bloquants` (the grid's rules), `colle` (what matches), `ecarts` (gaps), `lu: true`. **Never give the final score**: the application calculates it.
3. A single `noter_lot` per batch of job ads.
4. A job ad set to 0 by a blocking rule then goes to `ecartee`, with the rule as the comment.

## 5. Read in the browser

A tab of your own, a few ads at a time, the description only (not the whole page). Known pitfalls:

- **LinkedIn**: readable when logged in; loading it with a script is refused. A job ad "no longer accepting applications" or a page not found: `ecartee` ("job closed"), without presenting it.
- **Indeed**: prefer the direct URL `https://<country>.indeed.com/viewjob?jk=…` (for example `uk.indeed.com`); the tracking link in the e-mail triggers an anti-bot check.
- **Glassdoor**: wait for the page to load, keep the text from "Description" onwards. A "human" verification page: do not get around it, ask the user.
- **Hellowork, Free-Work** (French sites): the description is normally already in the database.
- Duplicate of a job ad already in the database: `ecartee` ("duplicate of #id").

Close the tab at the end, then `noter_lot` for these ads.

## 6. Report back

A table of the job ads above the grid's threshold, best first: score, no., company, title, location, pay, why, points to check, **full link**. Flag misleading scores (an ad that only climbs thanks to remote work, for example). One line for those just below.

End with: "Tell me which job ads get a go; the others will be discarded." On their answer: the ads without a go go to `ecartee` (reason as the comment), then offer to prepare the applications (`preparer-go` procedure).

If the workspace is under version control with git: commit the database (`data/vigie-emploi.sqlite`) with a message such as "Batch of DD/MM: N job ads, X discarded, Y scored".
