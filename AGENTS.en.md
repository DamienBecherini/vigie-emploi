# Driving vigie-emploi from an AI

This file is for an agent (Claude Code or another) that helps the user sort their job ads. The application contacts no AI model: the agent reads, scores and reports back, and the application keeps the state. Work and write in English with the user; the names of the commands, options, MCP tools, parameters and statuses are French identifiers and stay as they are (`ecartee` = discarded, `envoyee` = sent, `relancee` = followed up, `entretien` = interview, `refus` = rejected…).

Two ways to drive it: the **MCP tools** (`vigie-emploi mcp`, preferred when the MCP client is connected, see [`docs/utiliser-avec-une-ia.md`](docs/utiliser-avec-une-ia.md)) or the **CLI** with `--json`. Both call the same core.

## Rules

- CLI: always pass `--json`: the output is stable and unambiguous. Errors go to stderr (`{"ok": false, "erreur": "…"}`) with a non-zero exit code. MCP: an error comes back as an error result (`isError`), and the server keeps running.
- `_SUIVI.md` (the tracker) is generated from the database (`generer_suivi` / `vigie-emploi generer-suivi`): do not edit it by hand once the switch has been made. By default the preview `candidatures/_SUIVI.genere.md`; `remplacer` only if the user asks for it.
- The data folder comes from `VIGIE_EMPLOI_DATA`, `--data` or `vigie-emploi.config.json`. Never write personal data into the application's repository.
- Do not download LinkedIn, Indeed or Glassdoor pages with a script: read them in the user's browser, or ask them for the text (Glassdoor blocks bots). The Hellowork and Free-Work descriptions are already in the database after `ingest`.
- The scoring grid belongs to the user (`profil/grille.json` in their data folder): read it before scoring a batch (`grille` over MCP, `vigie-emploi grille --consignes --json` on the CLI). Never give the final score: score the criteria, and the application calculates it.
- Only change the grid (`modifier_grille`, `vigie-emploi grille --modifier`) when the user asks: first a trial run (`essai: true` / `--essai`) whose impact you show them, then save it with a summary.

## Full flow over MCP

1. **Ingest**: `ingerer_emails` (`garder: true` to keep the `.eml` files). Note `nouvelles` (new), `doublons` (duplicates), `ecartees` (discarded), `a_lire` (to read), `erreurs`.
2. **Read**: `offres_a_lire`. Depending on `lecture`: text in `description`; `navigateur` = open `url` in the user's browser; `humain` = ask them for the text. `lire_offre` for the full details.
3. **Score** with the grid: `grille` first (criteria, weights, scales, rules, inventory, examples, `consignes_ia`), then `noter_lot` (`{ "offres": [ {id, criteres, entrees, bloquants, colle, ecarts, lu, tags}, … ] }`) or `noter_offre` for a single one. See "Scoring with the grid" below. Seen before? `lister_offres` with `texte`.
4. **Summarise** for the user: job ads scored, those above their threshold (the grid's), with the breakdown (sub-scores, rules, "unknown" flags to check), conditions, what matches, gaps. No "go": `changer_statut` → `ecartee` with the reason as the comment.
5. **Apply** on their "go": `candidater` (full job ad, data folder, `dossier_suggere`, steps). Prepare the application file, the CV and the messages following their instructions (in the data folder).
6. **Record the application**: `enregistrer_candidature` with `dossier`, `cv`, `canal`, `message`, `prochaine_action`; once sent, `envoyee_le` (the job ad moves to `envoyee`). After that: `changer_statut` (`relancee`, `entretien`, `refus`, `close`, `abandonnee`) and `enregistrer_candidature` for the next action.
7. **Keep the log** (see below): each exchange becomes an event, and what comes next a deadline.
8. **Generate the tracker**: `generer_suivi` → `candidatures/_SUIVI.genere.md` (sections In progress, Sent with no reply, Closed; the next action comes from the next deadline).

## Scoring with the grid

1. Read the grid (`grille`). Criteria with `source: "ia"` are scored from 0 to 10 with a short justification; their `description` says what to look at. The technical criterion is judged against the inventory (`fort` / `moyen` / `leger` / `zero` = strong / medium / light / none): list the gaps. Calibrate your sub-scores on the `exemples`.
2. Do not score the calculated criteria (`teletravail`, `remuneration`): fill in `entrees` when the job ad gives them (`jours_sur_site` 0 to 5, 0 = fully remote; `salaire_min` / `salaire_max` as plain amounts in the grid's currency; `unite` an, mois, jour, heure = year, month, day, hour). Otherwise the application reads them from the job ad's fields; when unknown, they are worth 5 with a flag.
3. `bloquants`: ids of the active rules that apply (internship, defence…). An unknown rule is refused.
4. Do not send `note`: with `criteres`, it is ignored (reported in `avertissements`). The response gives the calculated score, the exact value and the `decomposition` (breakdown).
5. Trial run available: `noter_lot` with `essai: true` (CLI `noter --fichier lot.json --essai`) calculates without saving anything.
6. Changing priorities ("remote work matters more", "£50K is enough for me"): `modifier_grille` as a trial, show the impact (`montent`, `descendent`), then save with a `resume`; every criteria-based score is recalculated. Going back: `modifier_grille` with `restaurer_version`. History: `historique_grille`.

Sample entry:

```json
{ "id": 42,
  "criteres": { "technique": { "note": 8, "justification": "PHP, REST APIs; gap: PostgreSQL (none)" },
                "role": { "note": 7, "justification": "Senior, no lead role" },
                "interet": { "note": 6, "justification": "SaaS for small businesses" },
                "risque": { "note": 7, "justification": "Test on an existing project" } },
  "entrees": { "jours_sur_site": 2, "salaire_min": 55000, "salaire_max": 65000, "unite": "an" },
  "bloquants": [], "colle": "…", "ecarts": "…", "lu": true }
```

## Log: when the user reports a call, an interview, a message, a quote

1. **The event**: `ajouter_evenement` (CLI: `vigie-emploi evenement <id> …`) with the type (`message`, `entretien` = interview, `test`, `proposition` = offer or quote, `decision`, `note`), the actual date (`le`), a short summary, and whatever is known: `sens` (message `envoye` = sent / `recu` = received), `canal`, `interlocuteurs`, `montant` + `unite` and `jours` for a quote, `details`.
2. **Any document** (meeting notes, quote, call sheet): write it in the application folder (`candidatures/<company-role>/…`), then reference it in `fichiers` (path relative to the data folder; `fichiers_dossier` lists the existing ones). Never copy a document's content into the database.
3. **The next deadline**: a second `ajouter_evenement` dated in the future (`fait: false`), for example "Follow up if no news" at D+7, "Technical interview" on the planned date.
4. A deadline that has been met: `marquer_fait`, then the event for what happened. A change of stage remains a status (`changer_statut`: `relancee`, `entretien`, `refus`…).
5. At the start of a session: `echeances` (overdue items and the next 7 days) to tell the user what lies ahead.

A job ad already being followed that reappears in an alert or a batch keeps its status: do not rescore it or change its status because of that.

## "Process the e-mails" flow (CLI)

1. `vigie-emploi ingest --json`: reads `<data>/emails/*.eml`, adds the new job ads, deletes the processed e-mails. Note `nouvelles`, `doublons`, `ecartees`, `a_lire`, `erreurs`.
2. `vigie-emploi a-lire --json`: job ads to process without a score. `lecture` field:
   - `description`: the description is in the `description` field (truncated at 2,500 characters; `--complet` for all of it);
   - `navigateur`: open `url` in the user's browser;
   - `humain`: protected page, ask the user for the text.
3. Read the grid (`vigie-emploi grille --consignes --json`), then read each job ad and score its criteria.
4. Write a batch file (JSON array, format below) then `vigie-emploi noter --fichier lot.json` (`--essai` to check without saving). Job ads are found by `id` or `url`; they move to `notee` (scored).
5. Summarise for the user: job ads scored, those above their threshold with conditions, what matches and the gaps.
6. Depending on their answer:
   - "go": `vigie-emploi candidater <id> --json` (moves to `go`, returns the full job ad and a suggested folder);
   - no go: `vigie-emploi statut <id> ecartee --commentaire "reason"`.

Format of a batch entry:

```json
{
  "id": 42,
  "url": "https://www.linkedin.com/jobs/view/1234567890/",
  "titre": "…", "entreprise": "…", "lieu": "…", "contrat": "…", "remuneration": "…",
  "teletravail": "…", "publiee": "DD/MM/YYYY or NC", "stack": "…",
  "criteres": { "technique": { "note": 8, "justification": "…" }, "role": { "note": 7 }, "interet": { "note": 6 }, "risque": { "note": 7 } },
  "entrees": { "jours_sur_site": 3 }, "bloquants": [],
  "colle": "…", "ecarts": "…", "lu": true, "tags": ["wordpress"]
}
```

`id` or `url` is enough; the other fields fill in what is missing from the database. Old format (overall score, without `criteres`): `"note_brute": 6.5, "penalites": "…", "note": 6`, still accepted but frozen.

## Other useful commands

| Need | Command |
|---|---|
| Seen before? | `vigie-emploi list --texte "company" --json` |
| Best unprocessed job ads | `vigie-emploi list --statut notee --note-min 5 --tri note --json` |
| By batch received, best scores first | `vigie-emploi list --statut notee --tri recue_le:desc,note:desc --json` |
| My applications | `vigie-emploi list --candidatures --json` |
| Details of a job ad | `vigie-emploi show <id> --json` |
| Application (folder, channel, date sent, next action) | `vigie-emploi candidature <id> --dossier candidatures/x --canal LinkedIn --envoyee-le 02/11/2026 --prochaine-action "…" --json` |
| Next action only | `vigie-emploi prochaine-action <id> "Follow up on 09/11" --json` |
| Follow-up, interview, rejection | `vigie-emploi statut <id> relancee --commentaire "channel, date"` |
| Application tracker | `vigie-emploi generer-suivi --json` (preview `candidatures/_SUIVI.genere.md`) |
| Tags | `vigie-emploi tag <id> +a-reprendre -urgent --json` |
| Event (call, quote…) | `vigie-emploi evenement <id> --type proposition --le 15/10/2026 --resume "Quote sent via Upwork" --sens envoye --montant 3000 --unite "£" --jours 6 --fichier candidatures/x/quote.md --json` |
| Deadline | `vigie-emploi evenement <id> --type message --le +7 --resume "Follow up if no news" --json` |
| Log, deadlines | `vigie-emploi journal <id> --json`, `vigie-emploi echeances --jours 7 --json`, `vigie-emploi fait <evenement_id> --json` |
| Files in the folder | `vigie-emploi fichiers <id> --json` |
| Single score | `vigie-emploi noter <id> --json '{"criteres": {"technique": {"note": 8, "justification": "…"}, …}, "colle": "…", "ecarts": "…"}'` |
| Grid, instructions | `vigie-emploi grille --consignes --json` |
| Change a weight (trial, then for real) | `vigie-emploi grille --modifier '{"poids": {"teletravail": 30}}' --essai --json`, then `--resume "Remote work first"` |
| History, going back | `vigie-emploi grille --historique --json`, `vigie-emploi grille --restaurer 2 --json` |
| Recalculate | `vigie-emploi renoter --json` |

The dashboard's "Process N e-mails" and "Prepare N applications" buttons open a terminal in the data folder and start the agent with `/traiter-emails` or `/preparer-go`: these commands come from the data folder (the user's instructions); follow them as if the user had typed them. The dashboard updates itself as things are written.

The dashboard's "Apply" button copies `candidater <id>`: when the user pastes that text, run `vigie-emploi candidater <id> --json` and prepare the application following their instructions.

## Developing on this repository

- `npm test` and `npm run build` must pass before each commit.
- Fictitious fixtures only (`tests/fixtures`): never real e-mails or real job ads.
- Schema: add a migration `migrations/000N_name.sql`; never change a migration that has already been published.
- The repository's code and documentation are written in French; `AGENTS.en.md`, `README.en.md` and `modele-en/` are their English versions.
