# Piloter vigie-emploi depuis une IA

Ce fichier s'adresse à un agent (Claude Code ou autre) qui aide l'utilisateur à trier ses offres. L'application ne contacte aucun modèle d'IA : c'est l'agent qui lit, note et rend compte, l'application garde l'état.

Deux façons de piloter : les **outils MCP** (`vigie-emploi mcp`, à privilégier quand le client MCP est branché, voir [`docs/utiliser-avec-une-ia.md`](docs/utiliser-avec-une-ia.md)) ou la **CLI** avec `--json`. Les deux appellent le même noyau.

## Règles

- CLI : toujours passer `--json` : la sortie est stable et se lit sans ambiguïté. Les erreurs sortent sur stderr (`{"ok": false, "erreur": "…"}`) avec un code de retour non nul. MCP : une erreur revient comme résultat d'erreur (`isError`), le serveur continue.
- `_SUIVI.md` se génère depuis la base (`generer_suivi` / `vigie-emploi generer-suivi`) : ne pas l'éditer à la main une fois la bascule faite. Par défaut l'aperçu `candidatures/_SUIVI.genere.md` ; `remplacer` seulement si l'utilisateur le demande.
- Le dossier de données vient de `VIGIE_EMPLOI_DATA`, de `--data` ou de `vigie-emploi.config.json`. Ne jamais écrire de donnée personnelle dans le dépôt de l'application.
- Ne pas télécharger LinkedIn, Indeed ni Glassdoor par script : lire ces pages dans le navigateur de l'utilisateur, ou lui demander le texte (Glassdoor bloque les robots). Les descriptions Hellowork et Free-Work sont déjà en base après `ingest`.
- La grille de notation appartient à l'utilisateur (`profil/grille.json` de son dossier de données) : la lire avant de noter un lot (`grille` en MCP, `vigie-emploi grille --consignes --json` en CLI). Ne jamais donner la note finale : noter les critères, l'application calcule.
- Ne modifier la grille (`modifier_grille`, `vigie-emploi grille --modifier`) qu'à la demande de l'utilisateur : d'abord un essai (`essai: true` / `--essai`) dont on lui montre l'impact, puis l'enregistrement avec un résumé.

## Flux complet via MCP

1. **Ingérer** : `ingerer_emails` (`garder: true` pour conserver les `.eml`). Relever `nouvelles`, `doublons`, `ecartees`, `a_lire`, `erreurs`.
2. **Lire** : `offres_a_lire`. Selon `lecture` : texte dans `description` ; `navigateur` = ouvrir `url` dans le navigateur de l'utilisateur ; `humain` = lui demander le texte. `lire_offre` pour le détail complet.
3. **Noter** avec la grille : `grille` d'abord (critères, poids, barèmes, règles, inventaire, exemples, `consignes_ia`), puis `noter_lot` (`{ "offres": [ {id, criteres, entrees, bloquants, colle, ecarts, lu, tags}, … ] }`) ou `noter_offre` pour une seule. Voir « Noter avec la grille » ci-dessous. Déjà vue ? `lister_offres` avec `texte`.
4. **Résumer** à l'utilisateur : offres notées, celles au-dessus de son seuil (celui de la grille), avec la décomposition (sous-notes, règles, drapeaux « inconnu » à vérifier), conditions, ce qui colle, écarts. Sans « go » : `changer_statut` → `ecartee` avec la raison en commentaire.
5. **Candidater** sur son « go » : `candidater` (offre complète, dossier de données, `dossier_suggere`, étapes). Préparer le dossier, le CV et les messages selon ses consignes (dans le dossier de données).
6. **Enregistrer la candidature** : `enregistrer_candidature` avec `dossier`, `cv`, `canal`, `message`, `prochaine_action` ; à l'envoi, `envoyee_le` (l'offre passe en `envoyee`). Ensuite : `changer_statut` (`relancee`, `entretien`, `refus`, `close`, `abandonnee`) et `enregistrer_candidature` pour la prochaine action.
7. **Tenir le journal** (voir ci-dessous) : chaque échange devient un événement, la suite une échéance.
8. **Générer le suivi** : `generer_suivi` → `candidatures/_SUIVI.genere.md` (sections En cours, Envoyées sans suite, Closes ; la prochaine action vient de la prochaine échéance).

## Noter avec la grille

1. Lire la grille (`grille`). Les critères `source: "ia"` sont à noter de 0 à 10 avec une justification courte ; leur `description` dit quoi regarder. Le critère technique se juge contre l'inventaire (fort / moyen / léger / zéro) : lister les écarts. Caler ses sous-notes sur les `exemples`.
2. Ne pas noter les critères calculés (`teletravail`, `remuneration`) : remplir `entrees` quand l'offre les donne (`jours_sur_site` 0 à 5, 0 = full remote ; `salaire_min` / `salaire_max` en euros ; `unite` an, mois, jour, heure). Sinon l'application les lit dans les champs de l'offre ; inconnus, ils valent 5 avec un drapeau.
3. `bloquants` : identifiants des règles actives qui s'appliquent (stage, défense…). Une règle inconnue est refusée.
4. Ne pas envoyer `note` : avec `criteres`, il est ignoré (signalé dans `avertissements`). La réponse donne la note calculée, la valeur exacte et la `decomposition`.
5. Essai possible : `noter_lot` avec `essai: true` (CLI `noter --fichier lot.json --essai`) calcule sans rien enregistrer.
6. Changer de priorité (« le télétravail compte plus », « 50 K€ me suffisent ») : `modifier_grille` en essai, montrer l'impact (`montent`, `descendent`), puis enregistrer avec un `resume` ; toutes les notes à critères sont recalculées. Retour arrière : `modifier_grille` avec `restaurer_version`. Historique : `historique_grille`.

Exemple d'entrée :

```json
{ "id": 42,
  "criteres": { "technique": { "note": 8, "justification": "PHP, API REST ; écart : PostgreSQL (zéro)" },
                "role": { "note": 7, "justification": "Senior, pas de lead" },
                "interet": { "note": 6, "justification": "SaaS pour TPE" },
                "risque": { "note": 7, "justification": "Test sur projet existant" } },
  "entrees": { "jours_sur_site": 2, "salaire_min": 55000, "salaire_max": 65000, "unite": "an" },
  "bloquants": [], "colle": "…", "ecarts": "…", "lu": true }
```

## Journal : quand l'utilisateur raconte un appel, un entretien, un message, un devis

1. **L'événement** : `ajouter_evenement` (CLI : `vigie-emploi evenement <id> …`) avec le type (`message`, `entretien`, `test`, `proposition`, `decision`, `note`), la date réelle (`le`), un résumé court, et ce qui est connu : `sens` (message envoyé / reçu), `canal`, `interlocuteurs`, `montant` + `unite` et `jours` pour un devis, `details`.
2. **Le document éventuel** (compte rendu, devis, fiche d'appel) : l'écrire dans le dossier de candidature (`candidatures/<entreprise-poste>/…`), puis le citer dans `fichiers` (chemin relatif au dossier de données ; `fichiers_dossier` liste ceux qui existent). Ne jamais recopier le contenu d'un document dans la base.
3. **La prochaine échéance** : un second `ajouter_evenement` daté dans le futur (`fait: false`), par exemple « Relancer si sans nouvelles » à J+7, « Entretien technique » à la date prévue.
4. Une échéance réalisée : `marquer_fait`, puis l'événement de ce qui s'est passé. Un changement d'étape reste un statut (`changer_statut` : `relancee`, `entretien`, `refus`…).
5. En début de session : `echeances` (retards et 7 prochains jours) pour dire à l'utilisateur ce qui l'attend.

Une offre déjà suivie qui réapparaît dans une alerte ou un lot garde son statut : ne pas la renoter ni la changer de statut pour autant.

## Flux « traite les e-mails » (CLI)

1. `vigie-emploi ingest --json` : lit `<données>/emails/*.eml`, ajoute les nouvelles offres, supprime les e-mails traités. Relever `nouvelles`, `doublons`, `ecartees`, `a_lire`, `erreurs`.
2. `vigie-emploi a-lire --json` : offres à traiter sans note. Champ `lecture` :
   - `description` : la description est dans le champ `description` (tronquée à 2 500 caractères ; `--complet` pour tout) ;
   - `navigateur` : ouvrir `url` dans le navigateur de l'utilisateur ;
   - `humain` : page protégée, demander le texte à l'utilisateur.
3. Lire la grille (`vigie-emploi grille --consignes --json`), puis lire chaque offre et noter ses critères.
4. Écrire un fichier de lot (tableau JSON, format ci-dessous) puis `vigie-emploi noter --fichier lot.json` (`--essai` pour vérifier sans enregistrer). Les offres sont retrouvées par `id` ou par `url` ; elles passent en `notee`.
5. Résumer à l'utilisateur : offres notées, celles au-dessus de son seuil avec conditions, ce qui colle et les écarts.
6. Selon sa réponse :
   - « go » : `vigie-emploi candidater <id> --json` (passe en `go`, renvoie l'offre complète et un dossier suggéré) ;
   - pas de go : `vigie-emploi statut <id> ecartee --commentaire "raison"`.

Format d'une entrée de lot :

```json
{
  "id": 42,
  "url": "https://www.linkedin.com/jobs/view/1234567890/",
  "titre": "…", "entreprise": "…", "lieu": "…", "contrat": "…", "remuneration": "…",
  "teletravail": "…", "publiee": "JJ/MM/AAAA ou NC", "stack": "…",
  "criteres": { "technique": { "note": 8, "justification": "…" }, "role": { "note": 7 }, "interet": { "note": 6 }, "risque": { "note": 7 } },
  "entrees": { "jours_sur_site": 3 }, "bloquants": [],
  "colle": "…", "ecarts": "…", "lu": true, "tags": ["wordpress"]
}
```

`id` ou `url` suffit ; les autres champs complètent ce qui manque en base. Ancien format (note globale, sans `criteres`) : `"note_brute": 6.5, "penalites": "…", "note": 6`, encore accepté mais figé.

## Autres commandes utiles

| Besoin | Commande |
|---|---|
| Déjà vue ? | `vigie-emploi list --texte "entreprise" --json` |
| Meilleures offres non traitées | `vigie-emploi list --statut notee --note-min 5 --tri note --json` |
| Par lot reçu, meilleures notes d'abord | `vigie-emploi list --statut notee --tri recue_le:desc,note:desc --json` |
| Mes candidatures | `vigie-emploi list --candidatures --json` |
| Détail d'une offre | `vigie-emploi show <id> --json` |
| Candidature (dossier, canal, envoi, prochaine action) | `vigie-emploi candidature <id> --dossier candidatures/x --canal LinkedIn --envoyee-le 02/11/2026 --prochaine-action "…" --json` |
| Prochaine action seule | `vigie-emploi prochaine-action <id> "Relancer le 09/11" --json` |
| Relance, entretien, refus | `vigie-emploi statut <id> relancee --commentaire "canal, date"` |
| Suivi des candidatures | `vigie-emploi generer-suivi --json` (aperçu `candidatures/_SUIVI.genere.md`) |
| Tags | `vigie-emploi tag <id> +a-reprendre -urgent --json` |
| Événement (appel, devis…) | `vigie-emploi evenement <id> --type proposition --le 15/10/2026 --resume "Devis envoyé sur Malt" --sens envoye --montant 3000 --unite "€ HT" --jours 6 --fichier candidatures/x/devis.md --json` |
| Échéance | `vigie-emploi evenement <id> --type message --le +7 --resume "Relancer si sans nouvelles" --json` |
| Journal, échéances | `vigie-emploi journal <id> --json`, `vigie-emploi echeances --jours 7 --json`, `vigie-emploi fait <evenement_id> --json` |
| Fichiers du dossier | `vigie-emploi fichiers <id> --json` |
| Note seule | `vigie-emploi noter <id> --json '{"criteres": {"technique": {"note": 8, "justification": "…"}, …}, "colle": "…", "ecarts": "…"}'` |
| Grille, consignes | `vigie-emploi grille --consignes --json` |
| Changer un poids (essai, puis pour de vrai) | `vigie-emploi grille --modifier '{"poids": {"teletravail": 30}}' --essai --json`, puis `--resume "Télétravail prioritaire"` |
| Historique, retour arrière | `vigie-emploi grille --historique --json`, `vigie-emploi grille --restaurer 2 --json` |
| Recalculer | `vigie-emploi renoter --json` |

Les boutons « Traiter N e-mails » et « Préparer N candidatures » du tableau de bord ouvrent un terminal dans le dossier de données et lancent l'agent avec `/traiter-emails` ou `/preparer-go` : ces commandes viennent du dossier de données (consignes de l'utilisateur) ; les suivre comme si l'utilisateur les avait tapées. Le tableau de bord se met à jour seul au fil des écritures.

Le bouton « Candidater » du tableau de bord copie `candidater <id>` : quand l'utilisateur colle ce texte, lancer `vigie-emploi candidater <id> --json` et préparer la candidature selon ses consignes.

## Développer sur ce dépôt

- `npm test` et `npm run build` doivent passer avant chaque commit.
- Fixtures uniquement fictives (`tests/fixtures`) : jamais de vrais e-mails ni de vraies offres.
- Schéma : ajouter une migration `migrations/000N_nom.sql`, ne jamais modifier une migration déjà publiée.
- Interface et documentation en français.
