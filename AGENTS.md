# Piloter cap-emploi depuis une IA

Ce fichier s'adresse à un agent (Claude Code ou autre) qui aide l'utilisateur à trier ses offres. L'application ne contacte aucun modèle d'IA : c'est l'agent qui lit, note et rend compte, l'application garde l'état.

Deux façons de piloter : les **outils MCP** (`cap-emploi mcp`, à privilégier quand le client MCP est branché, voir [`docs/utiliser-avec-une-ia.md`](docs/utiliser-avec-une-ia.md)) ou la **CLI** avec `--json`. Les deux appellent le même noyau.

## Règles

- CLI : toujours passer `--json` : la sortie est stable et se lit sans ambiguïté. Les erreurs sortent sur stderr (`{"ok": false, "erreur": "…"}`) avec un code de retour non nul. MCP : une erreur revient comme résultat d'erreur (`isError`), le serveur continue.
- `_SUIVI.md` se génère depuis la base (`generer_suivi` / `cap-emploi generer-suivi`) : ne pas l'éditer à la main une fois la bascule faite. Par défaut l'aperçu `candidatures/_SUIVI.genere.md` ; `remplacer` seulement si l'utilisateur le demande.
- Le dossier de données vient de `CAP_EMPLOI_DATA`, de `--data` ou de `cap-emploi.config.json`. Ne jamais écrire de donnée personnelle dans le dépôt de l'application.
- Ne pas télécharger LinkedIn, Indeed ni Glassdoor par script : lire ces pages dans le navigateur de l'utilisateur, ou lui demander le texte (Glassdoor bloque les robots). Les descriptions Hellowork et Free-Work sont déjà en base après `ingest`.
- La grille de notation appartient à l'utilisateur (dans son dossier de données) : la lire avant de noter.

## Flux complet via MCP

1. **Ingérer** : `ingerer_emails` (`garder: true` pour conserver les `.eml`). Relever `nouvelles`, `doublons`, `ecartees`, `a_lire`, `erreurs`.
2. **Lire** : `offres_a_lire`. Selon `lecture` : texte dans `description` ; `navigateur` = ouvrir `url` dans le navigateur de l'utilisateur ; `humain` = lui demander le texte. `lire_offre` pour le détail complet.
3. **Noter** selon la grille de l'utilisateur : `noter_lot` (`{ "offres": [ {id, note, note_brute, penalites, colle, ecarts, lu, tags}, … ] }`) ou `noter_offre` pour une seule. Déjà vue ? `lister_offres` avec `texte`.
4. **Résumer** à l'utilisateur : offres notées, celles au-dessus de son seuil, conditions, ce qui colle, écarts. Sans « go » : `changer_statut` → `ecartee` avec la raison en commentaire.
5. **Candidater** sur son « go » : `candidater` (offre complète, dossier de données, `dossier_suggere`, étapes). Préparer le dossier, le CV et les messages selon ses consignes (dans le dossier de données).
6. **Enregistrer la candidature** : `enregistrer_candidature` avec `dossier`, `cv`, `canal`, `message`, `prochaine_action` ; à l'envoi, `envoyee_le` (l'offre passe en `envoyee`). Ensuite : `changer_statut` (`relancee`, `entretien`, `refus`, `close`, `abandonnee`) et `enregistrer_candidature` pour la prochaine action.
7. **Générer le suivi** : `generer_suivi` → `candidatures/_SUIVI.genere.md` (sections En cours, Envoyées sans suite, Closes).

## Flux « traite les e-mails » (CLI)

1. `cap-emploi ingest --json` : lit `<données>/emails/*.eml`, ajoute les nouvelles offres, supprime les e-mails traités. Relever `nouvelles`, `doublons`, `ecartees`, `a_lire`, `erreurs`.
2. `cap-emploi a-lire --json` : offres à traiter sans note. Champ `lecture` :
   - `description` : la description est dans le champ `description` (tronquée à 2 500 caractères ; `--complet` pour tout) ;
   - `navigateur` : ouvrir `url` dans le navigateur de l'utilisateur ;
   - `humain` : page protégée, demander le texte à l'utilisateur.
3. Lire et noter chaque offre selon la grille de l'utilisateur.
4. Écrire un fichier de lot (tableau JSON, format ci-dessous) puis `cap-emploi noter --fichier lot.json`. Les offres sont retrouvées par `id` ou par `url` ; elles passent en `notee`.
5. Résumer à l'utilisateur : offres notées, celles au-dessus de son seuil avec conditions, ce qui colle et les écarts.
6. Selon sa réponse :
   - « go » : `cap-emploi candidater <id> --json` (passe en `go`, renvoie l'offre complète et un dossier suggéré) ;
   - pas de go : `cap-emploi statut <id> ecartee --commentaire "raison"`.

Format d'une entrée de lot :

```json
{
  "id": 42,
  "url": "https://www.linkedin.com/jobs/view/1234567890/",
  "titre": "…", "entreprise": "…", "lieu": "…", "contrat": "…", "remuneration": "…",
  "teletravail": "…", "publiee": "JJ/MM/AAAA ou NC", "stack": "…",
  "note_brute": 6.5, "penalites": "-0,5 difficultés (…)", "note": 6,
  "colle": "…", "ecarts": "…", "lu": true, "tags": ["wordpress"]
}
```

`id` ou `url` suffit ; les autres champs complètent ce qui manque en base.

## Autres commandes utiles

| Besoin | Commande |
|---|---|
| Déjà vue ? | `cap-emploi list --texte "entreprise" --json` |
| Meilleures offres non traitées | `cap-emploi list --statut notee --note-min 5 --tri note --json` |
| Mes candidatures | `cap-emploi list --candidatures --json` |
| Détail d'une offre | `cap-emploi show <id> --json` |
| Candidature (dossier, canal, envoi, prochaine action) | `cap-emploi candidature <id> --dossier candidatures/x --canal LinkedIn --envoyee-le 02/11/2026 --prochaine-action "…" --json` |
| Prochaine action seule | `cap-emploi prochaine-action <id> "Relancer le 09/11" --json` |
| Relance, entretien, refus | `cap-emploi statut <id> relancee --commentaire "canal, date"` |
| Suivi des candidatures | `cap-emploi generer-suivi --json` (aperçu `candidatures/_SUIVI.genere.md`) |
| Tags | `cap-emploi tag <id> +a-reprendre -urgent --json` |
| Note seule | `cap-emploi noter <id> --json '{"note": 6, "note_brute": 6.5, "penalites": "…", "colle": "…", "ecarts": "…"}'` |

Le bouton « Candidater » du tableau de bord copie `candidater <id>` : quand l'utilisateur colle ce texte, lancer `cap-emploi candidater <id> --json` et préparer la candidature selon ses consignes.

## Développer sur ce dépôt

- `npm test` et `npm run build` doivent passer avant chaque commit.
- Fixtures uniquement fictives (`tests/fixtures`) : jamais de vrais e-mails ni de vraies offres.
- Schéma : ajouter une migration `migrations/000N_nom.sql`, ne jamais modifier une migration déjà publiée.
- Interface et documentation en français.
