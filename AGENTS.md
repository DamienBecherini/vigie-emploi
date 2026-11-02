# Piloter cap-emploi depuis une IA

Ce fichier s'adresse à un agent (Claude Code ou autre) qui aide l'utilisateur à trier ses offres. L'application ne contacte aucun modèle d'IA : c'est l'agent qui lit, note et rend compte, l'application garde l'état.

## Règles

- Toujours passer `--json` : la sortie est stable et se lit sans ambiguïté. Les erreurs sortent sur stderr (`{"ok": false, "erreur": "…"}`) avec un code de retour non nul.
- Le dossier de données vient de `CAP_EMPLOI_DATA`, de `--data` ou de `cap-emploi.config.json`. Ne jamais écrire de donnée personnelle dans le dépôt de l'application.
- Ne pas télécharger LinkedIn, Indeed ni Glassdoor par script : lire ces pages dans le navigateur de l'utilisateur, ou lui demander le texte (Glassdoor bloque les robots). Les descriptions Hellowork et Free-Work sont déjà en base après `ingest`.
- La grille de notation appartient à l'utilisateur (dans son dossier de données) : la lire avant de noter.

## Flux « traite les e-mails »

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
| Envoi, relance, entretien, refus | `cap-emploi statut <id> envoyee --commentaire "canal, date"` |
| Tags | `cap-emploi tag <id> +a-reprendre -urgent --json` |
| Note seule | `cap-emploi noter <id> --json '{"note": 6, "note_brute": 6.5, "penalites": "…", "colle": "…", "ecarts": "…"}'` |

Le bouton « Candidater » du tableau de bord copie `candidater <id>` : quand l'utilisateur colle ce texte, lancer `cap-emploi candidater <id> --json` et préparer la candidature selon ses consignes.

## Développer sur ce dépôt

- `npm test` et `npm run build` doivent passer avant chaque commit.
- Fixtures uniquement fictives (`tests/fixtures`) : jamais de vrais e-mails ni de vraies offres.
- Schéma : ajouter une migration `migrations/000N_nom.sql`, ne jamais modifier une migration déjà publiée.
- Interface et documentation en français.
