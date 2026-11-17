# Piloter vigie-emploi depuis une IA

Ce fichier s'adresse à un agent (Claude Code ou autre) qui aide l'utilisateur à trier ses offres. L'application ne contacte aucun modèle d'IA : c'est l'agent qui lit, note et rend compte, l'application garde l'état.

Deux façons de piloter : les **outils MCP** (`vigie-emploi mcp`, à privilégier quand le client MCP est branché, voir [`docs/utiliser-avec-une-ia.md`](docs/utiliser-avec-une-ia.md)) ou la **CLI** avec `--json`. Les deux appellent le même noyau.

## Règles

- CLI : toujours passer `--json` : la sortie est stable et se lit sans ambiguïté. Les erreurs sortent sur stderr (`{"ok": false, "error": "…"}`) avec un code de retour non nul. MCP : une erreur revient comme résultat d'erreur (`isError`), le serveur continue.
- `_SUIVI.md` se génère depuis la base (`generate_tracker` / `vigie-emploi generate-tracker`) : ne pas l'éditer à la main une fois la bascule faite. Par défaut l'aperçu `candidatures/_SUIVI.genere.md` ; `replace` seulement si l'utilisateur le demande.
- Le dossier de données vient de `VIGIE_EMPLOI_DATA`, de `--data` ou de `vigie-emploi.config.json`. Ne jamais écrire de donnée personnelle dans le dépôt de l'application.
- Ne pas télécharger LinkedIn, Indeed ni Glassdoor par script : lire ces pages dans le navigateur de l'utilisateur, ou lui demander le texte (Glassdoor bloque les robots). Les descriptions Hellowork et Free-Work sont déjà en base après `ingest`.
- La grille de notation appartient à l'utilisateur (`profil/grille.json` de son dossier de données) : la lire avant de noter un lot (`rubric` en MCP, `vigie-emploi rubric --instructions --json` en CLI). Ne jamais donner la note finale : noter les critères, l'application calcule.
- Ne modifier la grille (`update_rubric`, `vigie-emploi rubric --update`) qu'à la demande de l'utilisateur : d'abord un essai (`dry_run: true` / `--dry-run`) dont on lui montre l'impact, puis l'enregistrement avec un résumé.

## Flux complet via MCP

1. **Ingérer** : `ingest_emails` (`keep: true` pour conserver les `.eml`). Relever `added`, `duplicates`, `dismissed`, `to_read`, `errors`.
2. **Lire** : `offers_to_read`. Selon `reading` : texte dans `description` ; `browser` = ouvrir `url` dans le navigateur de l'utilisateur ; `human` = lui demander le texte. `read_offer` pour le détail complet.
3. **Noter** avec la grille : `rubric` d'abord (critères, poids, barèmes, règles, inventaire, exemples, `instructions_ai`), puis `score_batch` (`{ "offers": [ {id, criteria, inputs, blockers, fit, gaps, read, tags}, … ] }`) ou `score_offer` pour une seule. Voir « Noter avec la grille » ci-dessous. Déjà vue ? `list_offers` avec `text`.
4. **Résumer** à l'utilisateur : offres notées, celles au-dessus de son seuil (celui de la grille), avec la décomposition (sous-notes, règles, drapeaux « inconnu » à vérifier), conditions, ce qui colle, écarts. Sans « go » : `change_status` → `dismissed` avec la raison en commentaire.
5. **Candidater** sur son « go » : `apply` (offre complète, dossier de données, `suggested_folder`, étapes). Préparer le dossier, le CV et les messages selon ses consignes (dans le dossier de données).
6. **Enregistrer la candidature** : `save_application` avec `folder`, `cv`, `channel`, `message`, `next_action` ; à l'envoi, `sent_at` (l'offre passe en `sent`). Ensuite : `change_status` (`followed-up`, `interview`, `rejected`, `closed`, `withdrawn`) et `save_application` pour la prochaine action.
7. **Tenir le journal** (voir ci-dessous) : chaque échange devient un événement, la suite une échéance.
8. **Générer le suivi** : `generate_tracker` → `candidatures/_SUIVI.genere.md` (sections En cours, Envoyées sans suite, Closes ; la prochaine action vient de la prochaine échéance).

## Noter avec la grille

1. Lire la grille (`rubric`). Les critères `source: "ai"` sont à noter de 0 à 10 avec une justification courte ; leur `description` dit quoi regarder. Le critère technique se juge contre l'inventaire (`strong` / `medium` / `light` / `zero`) : lister les écarts. Caler ses sous-notes sur les `examples`.
2. Ne pas noter les critères calculés (`remote`, `compensation`) : remplir `inputs` quand l'offre les donne (`onsite_days` 0 à 5, 0 = full remote ; `salary_min` / `salary_max` en euros ; `unit` year, month, day, hour). Sinon l'application les lit dans les champs de l'offre ; inconnus, ils valent 5 avec un drapeau.
3. `blockers` : identifiants des règles actives qui s'appliquent (stage, défense…). Une règle inconnue est refusée.
4. Ne pas envoyer `score` : avec `criteria`, il est ignoré (signalé dans `warnings`). La réponse donne la note calculée, la valeur exacte et la `breakdown`.
5. Essai possible : `score_batch` avec `dry_run: true` (CLI `score --file lot.json --dry-run`) calcule sans rien enregistrer.
6. Changer de priorité (« le télétravail compte plus », « 50 K€ me suffisent ») : `update_rubric` en essai, montrer l'impact (`rising`, `falling`), puis enregistrer avec un `summary` ; toutes les notes à critères sont recalculées. Retour arrière : `update_rubric` avec `restore_version`. Historique : `rubric_history`.

Exemple d'entrée :

```json
{ "id": 42,
  "criteria": { "technique": { "score": 8, "justification": "PHP, API REST ; écart : PostgreSQL (zéro)" },
                "role": { "score": 7, "justification": "Senior, pas de lead" },
                "interet": { "score": 6, "justification": "SaaS pour TPE" },
                "risque": { "score": 7, "justification": "Test sur projet existant" } },
  "inputs": { "onsite_days": 2, "salary_min": 55000, "salary_max": 65000, "unit": "year" },
  "blockers": [], "fit": "…", "gaps": "…", "read": true }
```

## Journal : quand l'utilisateur raconte un appel, un entretien, un message, un devis

1. **L'événement** : `add_event` (CLI : `vigie-emploi event <id> …`) avec le type (`message`, `interview`, `test`, `proposal`, `decision`, `note`), la date réelle (`at`), un résumé court, et ce qui est connu : `direction` (message envoyé / reçu), `channel`, `contacts`, `amount` + `unit` et `days` pour un devis, `details`.
2. **Le document éventuel** (compte rendu, devis, fiche d'appel) : l'écrire dans le dossier de candidature (`candidatures/<entreprise-poste>/…`), puis le citer dans `files` (chemin relatif au dossier de données ; `folder_files` liste ceux qui existent). Ne jamais recopier le contenu d'un document dans la base.
3. **La prochaine échéance** : un second `add_event` daté dans le futur (`done: false`), par exemple « Relancer si sans nouvelles » à J+7, « Entretien technique » à la date prévue.
4. Une échéance réalisée : `mark_done`, puis l'événement de ce qui s'est passé. Un changement d'étape reste un statut (`change_status` : `followed-up`, `interview`, `rejected`…).
5. En début de session : `deadlines` (retards et 7 prochains jours) pour dire à l'utilisateur ce qui l'attend.

Une offre déjà suivie qui réapparaît dans une alerte ou un lot garde son statut : ne pas la renoter ni la changer de statut pour autant.

## Flux « traite les e-mails » (CLI)

1. `vigie-emploi ingest --json` : lit `<données>/emails/*.eml`, ajoute les nouvelles offres, supprime les e-mails traités. Relever `added`, `duplicates`, `dismissed`, `to_read`, `errors`.
2. `vigie-emploi to-read --json` : offres à traiter sans note. Champ `reading` :
   - `description` : la description est dans le champ `description` (tronquée à 2 500 caractères ; `--full` pour tout) ;
   - `browser` : ouvrir `url` dans le navigateur de l'utilisateur ;
   - `human` : page protégée, demander le texte à l'utilisateur.
3. Lire la grille (`vigie-emploi rubric --instructions --json`), puis lire chaque offre et noter ses critères.
4. Écrire un fichier de lot (tableau JSON, format ci-dessous) puis `vigie-emploi score --file lot.json` (`--dry-run` pour vérifier sans enregistrer). Les offres sont retrouvées par `id` ou par `url` ; elles passent en `scored`.
5. Résumer à l'utilisateur : offres notées, celles au-dessus de son seuil avec conditions, ce qui colle et les écarts.
6. Selon sa réponse :
   - « go » : `vigie-emploi apply <id> --json` (passe en `go`, renvoie l'offre complète et un dossier suggéré) ;
   - pas de go : `vigie-emploi status <id> dismissed --comment "raison"`.

Format d'une entrée de lot :

```json
{
  "id": 42,
  "url": "https://www.linkedin.com/jobs/view/1234567890/",
  "title": "…", "company": "…", "location": "…", "contract": "…", "compensation": "…",
  "remote": "…", "published": "JJ/MM/AAAA ou NC", "stack": "…",
  "criteria": { "technique": { "score": 8, "justification": "…" }, "role": { "score": 7 }, "interet": { "score": 6 }, "risque": { "score": 7 } },
  "inputs": { "onsite_days": 3 }, "blockers": [],
  "fit": "…", "gaps": "…", "read": true, "tags": ["wordpress"]
}
```

`id` ou `url` suffit ; les autres champs complètent ce qui manque en base. Ancien format (note globale, sans `criteria`) : `"raw_score": 6.5, "penalties": "…", "score": 6`, encore accepté mais figé.

## Autres commandes utiles

| Besoin | Commande |
|---|---|
| Déjà vue ? | `vigie-emploi list --text "entreprise" --json` |
| Meilleures offres non traitées | `vigie-emploi list --status scored --score-min 5 --sort score --json` |
| Par lot reçu, meilleures notes d'abord | `vigie-emploi list --status scored --sort received_at:desc,score:desc --json` |
| Mes candidatures | `vigie-emploi list --applications --json` |
| Détail d'une offre | `vigie-emploi show <id> --json` |
| Candidature (dossier, canal, envoi, prochaine action) | `vigie-emploi application <id> --folder candidatures/x --channel LinkedIn --sent-at 02/11/2026 --next-action "…" --json` |
| Prochaine action seule | `vigie-emploi next-action <id> "Relancer le 09/11" --json` |
| Relance, entretien, refus | `vigie-emploi status <id> followed-up --comment "canal, date"` |
| Suivi des candidatures | `vigie-emploi generate-tracker --json` (aperçu `candidatures/_SUIVI.genere.md`) |
| Tags | `vigie-emploi tag <id> +a-reprendre -urgent --json` |
| Événement (appel, devis…) | `vigie-emploi event <id> --type proposal --at 15/10/2026 --summary "Devis envoyé sur Malt" --direction sent --amount 3000 --unit "€ HT" --days 6 --file candidatures/x/devis.md --json` |
| Échéance | `vigie-emploi event <id> --type message --at +7 --summary "Relancer si sans nouvelles" --json` |
| Journal, échéances | `vigie-emploi journal <id> --json`, `vigie-emploi deadlines --days 7 --json`, `vigie-emploi done <event_id> --json` |
| Fichiers du dossier | `vigie-emploi files <id> --json` |
| Note seule | `vigie-emploi score <id> --json '{"criteria": {"technique": {"score": 8, "justification": "…"}, …}, "fit": "…", "gaps": "…"}'` |
| Grille, consignes | `vigie-emploi rubric --instructions --json` |
| Changer un poids (essai, puis pour de vrai) | `vigie-emploi rubric --update '{"weight": {"remote": 30}}' --dry-run --json`, puis `--summary "Télétravail prioritaire"` |
| Historique, retour arrière | `vigie-emploi rubric --history --json`, `vigie-emploi rubric --restore 2 --json` |
| Recalculer | `vigie-emploi rescore --json` |

Les boutons « Traiter N e-mails » et « Préparer N candidatures » du tableau de bord ouvrent un terminal dans le dossier de données et lancent l'agent avec `/traiter-emails` ou `/preparer-go` : ces commandes viennent du dossier de données (consignes de l'utilisateur) ; les suivre comme si l'utilisateur les avait tapées. Le tableau de bord se met à jour seul au fil des écritures.

Le bouton « Candidater » du tableau de bord copie `apply <id>` : quand l'utilisateur colle ce texte, lancer `vigie-emploi apply <id> --json` et préparer la candidature selon ses consignes.

## Développer sur ce dépôt

- `npm test` et `npm run build` doivent passer avant chaque commit.
- Fixtures uniquement fictives (`tests/fixtures`) : jamais de vrais e-mails ni de vraies offres.
- Schéma : ajouter une migration `migrations/000N_nom.sql`, ne jamais modifier une migration déjà publiée.
- Code (identifiants, commentaires, tests) en anglais ; interface et documentation en français, avec leurs versions anglaises (`AGENTS.en.md`, `README.en.md`, `scaffold-en/`, dictionnaires `en.ts`).
