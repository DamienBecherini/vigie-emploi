# ADR 0003 — Application journal, deadlines and folder files

**English** · [Français](0003-journal-and-deadlines.fr.md)

Date: 02/11/2026 · Status: accepted

> The tool, field and command names quoted are those of the time, in French; the code and the API have since moved to English (for example `ajouter_evenement` → `add_event`, `noter_lot` → `score_batch`, `grille` → `rubric`).

## Context

Sprint 3: the follow-up of an application (messages, calls, quotes, follow-ups) lived in the "Suivi" sections of the `dossier-candidature.md` files, in varied formats (Date | Event tables, dated bullets, checkboxes). Nothing flagged a follow-up that was due or an upcoming interview. It was also necessary to open the folder's documents from the dashboard, and to fix a flaw: an offer already being tracked, seen again in an alert batch or in the register, fell back to "scored" or "dismissed".

## Decisions

1. **The database knows what happened and when; the Markdown folder keeps the documents.** An event never contains the content of a document, only its path (relative to the data folder, with forward slashes, without `..` or a hidden segment).
2. **A single `evenements` table, without over-modelling** (migration 0003): six types (`message`, `entretien`, `test`, `proposition`, `decision`, `note`), optional `sens` (direction), `le` as `AAAA-MM-JJ` or `AAAA-MM-JJTHH:MM` (local time, no time zone: personal use on one machine), `fait`, `resume`, optional fields (`details`, `canal`, `interlocuteurs`, `montant` + `unite` as free text, `jours`), `fichiers` as JSON, `origine` (`interface`, `cli`, `mcp`, `import`), `cle_import` (fingerprint of the imported line, unique index per offer). Indexes on `(le, fait)` and `(offre_id, le)`.
3. **A deadline is an event not done.** No separate table: `fait` defaults to `false` for a future date and `true` otherwise; overdue = not done and dated before today. SQL view `echeances` (events not done + offer); the function `echeances()` filters on N days and separates overdue from upcoming. Comparisons by day (a bare date of today is not "future").
4. **Next action of the tracker**: the next deadline not done (the oldest, so an overdue one first), "**04/11** : Relancer" (follow up); otherwise the field `candidatures.prochaine_action`, kept for compatibility.
5. **Importing the journals** in `import-historique`, after the tracker (which links the offers to their folders): active folders only, sections whose title contains "Suivi". Lines imported: tables with a Date column, dated bullets, dated ticked checkboxes (year taken from the context for "26/10"); unticked checkboxes and code blocks ignored. Type guessed from keywords, in this order: incoming contact ("E-mail de…") → message received; proposal / quote sent or received; decision (rejection, closure, withdrawal, set aside, GO); test; interview ("Appel à 15 h", "entretien avec"); a recognised direction → message; otherwise `note`, listed in the report. The direction is the first clue in the text ("Brief reçu… réponse envoyée" (brief received… answer sent) → received; "non envoyé" (not sent) does not count). Amount and days are read only for a proposal.
6. **Idempotence of the import**: `cle_import = suivi:<empreinte(date|texte)>`. A line rewritten in the folder creates a new event and removes the old one if it has not been modified since (`maj_le` empty); an event that was imported and then corrected in the interface is kept.
7. **Status of a tracked offer**: the current status is the latest in the history, except that a row with an automatic origin (`ingest`, `import-lot`, `import-registre`) and from before the go (`nouvelle`, `a-lire`, `notee`, `ecartee`) ranks after the others as soon as the offer has a tracking status (`go` and beyond). The row stays in the history (as a trace) but no longer prevails. Migration 0003 recomputes all the statuses with this rule. An alert that offers a tracked offer again adds a note "Revue le …" (seen again on …) to the journal (one per day and per source).
8. **Reading files** through `/api/fichier/<chemin>` (path in the URL, so that the relative links of a rendered Markdown file stay inside the folder): path validated then resolved (`realpath`) and checked to be inside the data folder; `data/` and `emails/` refused. Markdown rendered by `marked` in a page without scripts (CSP `default-src 'none'`), other text files and `.html` as `text/plain`, PDFs and images as they are, everything else as a download; `nosniff` everywhere. The server refuses any `Host` header other than `localhost`, `127.0.0.1` or `[::1]` (defence against "DNS rebinding", since the API now serves personal files).
9. **Interface**: journal and files in the detail panel (the details of an offer include `evenements`, already ordered by the server); "Coming up" banner (overdue + 7 days) and a small Statistics view on the main screen.
10. **Minimal statistics**: applications sent (sending date, or status sent and beyond), with an answer (message or proposal received, interview, test, interview or rejection status), interview, proposal; average delay between the sending (ISO date) and the first answer dated after the day of sending.
11. **MCP**: six more tools (`ajouter_evenement`, `modifier_evenement`, `journal`, `echeances`, `marquer_fait`, `fichiers_dossier`); no deletion by the AI (interface only).

## Consequences

- The Markdown journals of the folders remain the source as long as the user keeps them; once the habit of going through the interface or the AI is formed, the import becomes useless (it does not recreate anything already imported).
- Guessing the types is approximate: untyped lines are stored as `note` and listed; they can be corrected in the interface (a correction is no longer removed by an import).
- Closed applications in the tracker have no sending date: the response delay only covers applications dated on both sides, hence low figures at first.
