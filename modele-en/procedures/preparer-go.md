# Procedure: prepare the applications marked "go"

Triggers: "prepare my applications", "prepare the go's", "Prepare applications" button of the dashboard.

## 1. Find the job ads

`lister_offres` with `statuts: ["go"]`. Keep those without an application file (`fichiers_dossier`: `existe: false`). The others are already prepared: remind the user of them at the end if they have not been sent. None at all: say so and stop.

## 2. Before writing

- Read **the whole of `_CONTEXTE.md`**: facts, claimable inventory, restrictions, confidentiality.
- Read [`cv-cible.md`](cv-cible.md).
- For each job ad: `lire_offre` (description, score, breakdown); open the ad **and the application form** if a browser is available; **otherwise ask the user, before writing**, what the form asks for: CV only, a message and its character limit, questions, a required cover letter. A Glassdoor "Easy Apply" often goes through an Indeed form that accepts a message of up to 4,000 characters: prepare one.

## 3. For each job ad

1. `candidater` (returns `dossier_suggere`, the suggested folder).
2. Create `candidatures/<company>-<role>/dossier-candidature.md` from `candidatures/_MODELE-dossier-candidature.md`: the ad, what matches (evidence), the gaps to own up to, the conditions, the questions, the form, the messages (within the channel's limit, length stated), the follow-up.
3. A targeted CV if the ad warrants it ([`cv-cible.md`](cv-cible.md)); otherwise the reference CV, **copied under a name that mentions no other company**.
4. Messages: start from the matching outline in [`../messages/MODELES.md`](../messages/MODELES.md). A cover letter only if the form requires one (outline 6).
5. Length of each message: `{{CMD}} compter <dossier-candidature.md>` or the `compter` tool (the real figure, not an estimate).
6. `enregistrer_candidature`: `dossier`, `cv` (the PDF), `canal`, `prochaine_action` ("Send via …").

## 4. Wrapping up

`generer_suivi` with `remplacer: true`. If the workspace is under version control: commit (one per job ad or one for the batch).

Then, for each application to send: where to send it (full URL), the application file and the CV (full paths), the messages to copy in the "text to copy and paste" format of `AGENTS.md`, and the form's pitfalls (a pre-filled CV to replace, questions). End with: "Tell me what you have sent: I will mark each job ad as sent and set a follow-up."
