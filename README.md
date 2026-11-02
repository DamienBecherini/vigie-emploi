# cap-emploi

Application locale de suivi des offres d'emploi et de mission : une base SQLite, un tableau de bord web et une CLI qu'une IA (Claude Code ou autre) peut piloter.

- **Ingestion** des e-mails d'alertes (`.eml` de LinkedIn, Indeed, Glassdoor, Hellowork, Free-Work) : décodage des liens de suivi, dédoublonnage, exclusion sur l'intitulé, lecture du JSON-LD public de Hellowork et Free-Work.
- **Notation** par l'IA de l'utilisateur, via la CLI : l'application n'appelle aucun modèle d'IA.
- **Statuts** (de `nouvelle` à `entretien`, `refus`, `close`…), **tags**, **candidatures**, avec historique.
- **Tableau de bord** paginé côté serveur, prévu pour des dizaines de milliers d'offres ; notes et suivi des candidatures éditables.
- **Serveur MCP** (`cap-emploi mcp`) : une IA pilote l'application par des outils (voir [`docs/utiliser-avec-une-ia.md`](docs/utiliser-avec-une-ia.md)).
- **Journal des candidatures** : messages, entretiens, tests, propositions (montant, jours), décisions, notes, datés ; une date future non faite est une **échéance** (bandeau « À venir », prochaine action du suivi). Les documents restent dans le dossier de candidature : un événement n'en garde que le chemin.
- **Fichiers du dossier** de candidature listés et ouverts depuis le tableau de bord (Markdown rendu, PDF tel quel).
- **Suivi des candidatures** (`_SUIVI.md`) généré depuis la base ; **statistiques** minimales (candidatures par étape, délai de réponse).

Le code ne contient aucune donnée personnelle : tout vit dans un **dossier de données** choisi par l'utilisateur.

## Installation

Prérequis : Node.js 24 ou plus (SQLite est intégré à Node via `node:sqlite`, rien à compiler).

```sh
git clone <dépôt> cap-emploi
cd cap-emploi
npm install
npm run build      # vérifie les types et compile l'interface dans dist/ui
npm link           # rend la commande `cap-emploi` disponible partout (facultatif)
```

Sans `npm link`, remplacer `cap-emploi` par `node <chemin>/bin/cap-emploi.js`.

## Configuration du dossier de données

Le dossier de données contient la base et la boîte de réception :

```
<dossier>/
  data/cap-emploi.sqlite   base (créée au premier lancement)
  emails/                  .eml à ingérer (supprimés une fois traités)
  candidatures/            historique facultatif à reprendre (voir import-historique)
```

Pour le désigner, au choix (du plus prioritaire au moins prioritaire) :

1. l'option `--data <dossier>` sur chaque commande ;
2. la variable d'environnement `CAP_EMPLOI_DATA` ;
3. un fichier `cap-emploi.config.json` (non versionné) dans le dossier courant, dans le dossier de données ou à la racine de l'application. Modèle : [`cap-emploi.config.example.json`](cap-emploi.config.example.json).

| Clé | Rôle | Défaut |
|---|---|---|
| `dossierDonnees` | Dossier de données (chemin absolu ou relatif au fichier) | — |
| `base` | Chemin de la base | `<données>/data/cap-emploi.sqlite` |
| `emails` | Boîte de réception | `<données>/emails` |
| `port` | Port du tableau de bord | `4410` |
| `telechargerJsonLd` | Lire les pages Hellowork / Free-Work | `true` |
| `titresExclus` | Expressions régulières (sans casse) : intitulés écartés sans lecture | `[]` |
| `employeursRefuses` | Expressions régulières : employeurs refusés (intitulé, entreprise, début de la description) | `[]` |

Variables d'environnement reconnues aussi : `CAP_EMPLOI_CONFIG` (fichier de config), `CAP_EMPLOI_BASE` (base), `CAP_EMPLOI_PORT`.

## Commandes

Toutes les commandes acceptent `--json` (sortie stable pour une IA), `--data` et `--config`. `cap-emploi --help` donne la liste complète.

| Commande | Effet |
|---|---|
| `cap-emploi ingest [--keep] [--no-fetch] [--emails <dossier>]` | Lit les `.eml`, ajoute les nouvelles offres (`nouvelle`, ou `ecartee` avec le motif pour les intitulés exclus), puis **supprime les e-mails traités** (sauf `--keep`). Résumé : nouvelles, doublons, écartées, à lire |
| `cap-emploi import-historique` | Reprend `candidatures/_lots/*.json`, `candidatures/_ecartees.md`, `candidatures/_SUIVI.md` et les sections « Suivi » des `candidatures/*/dossier-candidature.md` (journal, voir plus bas) ; lecture seule, idempotent, avec un rapport des lignes non reconnues. Un `_SUIVI.md` généré par cap-emploi n'est pas relu |
| `cap-emploi list [filtres]` | Liste paginée : `--statut a,b`, `--note-min`, `--note-max`, `--sans-note`, `--source`, `--tag`, `--depuis` / `--jusqua` (réception), `--texte`, `--contrat`, `--teletravail`, `--candidatures`, `--page`, `--taille`, `--tri`, `--ordre` |
| `cap-emploi show <id>` | Détail : description, notes, historique des statuts, tags, candidature |
| `cap-emploi a-lire [--limite N] [--complet]` | Offres à traiter sans note, avec l'URL à lire, ou la description déjà extraite |
| `cap-emploi noter <id> --json '{…}'` | Enregistre une note pour une offre |
| `cap-emploi noter --fichier lot.json` | Enregistre un lot de notes (offres retrouvées par `id` ou par `url`, créées au besoin) |
| `cap-emploi statut <id> <statut> [--commentaire "…"]` | Change le statut (historisé) |
| `cap-emploi tag <id> +ajout -retrait` | Ajoute / retire des tags |
| `cap-emploi candidater <id>` | Passe l'offre en `go` et affiche ce qu'il faut pour préparer la candidature |
| `cap-emploi candidature <id> [--dossier] [--cv] [--canal] [--envoyee-le] [--message] [--prochaine-action]` | Enregistre la candidature (`""` efface un champ) ; avec `--envoyee-le`, l'offre passe en `envoyee` |
| `cap-emploi prochaine-action <id> "texte"` | Prochaine action de la candidature (`-` pour l'effacer) |
| `cap-emploi lien <id> <url ou ->` | Lien de l'offre |
| `cap-emploi evenement <id> --type <type> [--le "JJ/MM/AAAA HH:MM"] --resume "…" [--sens envoye\|recu] [--canal] [--interlocuteurs] [--details] [--montant 3000 --unite "€ HT"] [--jours 6] [--fichier <chemin>]… [--fait\|--no-fait]` | Ajoute un événement au journal (types : `message`, `entretien`, `test`, `proposition`, `decision`, `note`). `--le` : JJ/MM/AAAA, AAAA-MM-JJ, avec heure facultative, `demain`, `+3` ; par défaut maintenant. Daté dans le futur, il n'est pas fait : c'est une échéance |
| `cap-emploi journal <id>` | Journal de la candidature : échéances d'abord (retards en tête), puis du plus récent au plus ancien |
| `cap-emploi echeances [--jours 7]` | Échéances en retard et à venir sur N jours, toutes offres confondues |
| `cap-emploi fait <evenement_id> [--no-fait]` | Marque une échéance comme faite (ou la rouvre) |
| `cap-emploi fichiers <id>` | Fichiers du dossier de candidature (chemins à citer dans `--fichier`) |
| `cap-emploi stats` | Candidatures par étape (envoyée, réponse, entretien, proposition) et délai moyen avant la première réponse |
| `cap-emploi generer-suivi [--sortie <fichier>] [--remplacer]` | Génère le suivi des candidatures depuis la base : `candidatures/_SUIVI.genere.md` par défaut (aperçu), `candidatures/_SUIVI.md` avec `--remplacer` |
| `cap-emploi mcp` | Serveur MCP (stdio) pour une IA |
| `cap-emploi serve [--port 4410]` | Lance le tableau de bord sur http://localhost:4410 |

Statuts : `nouvelle`, `a-lire`, `notee`, `ecartee`, `go`, `envoyee`, `relancee`, `entretien`, `refus`, `close`, `abandonnee`. « Mes candidatures » regroupe `envoyee` et les suivants.

Format d'une note (celui des lots) :

```json
{
  "source": "linkedin", "url": "https://www.linkedin.com/jobs/view/1234567890/",
  "titre": "…", "entreprise": "…", "lieu": "…", "contrat": "CDI", "remuneration": "50-60 K€",
  "teletravail": "hybride", "publiee": "NC", "stack": "PHP, API",
  "note_brute": 6.5, "penalites": "-0,5 difficultés (…)", "note": 6,
  "colle": "…", "ecarts": "…", "lu": true
}
```

Champs facultatifs : `id` (à la place de `url`), `description`, `grille_version`, `tags`. Les champs descriptifs ne complètent que ce qui manque ; la dernière note fait foi.

## Tableau de bord

`cap-emploi serve`, puis http://localhost:4410 (écoute sur 127.0.0.1 uniquement).

- Tableau paginé côté serveur (25 à 500 lignes par page), tri par colonne, colonnes masquables.
- Filtres : note, dates de réception et de publication, source, statut, contrat, télétravail, tags, recherche plein texte (accents ignorés). Les filtres sont dans l'URL : on peut la garder en favori.
- Vues rapides : à traiter, notées ≥ 4,5, mes candidatures.
- Bandeau **À venir** au-dessus du tableau : échéances en retard et des 7 prochains jours, chacune ouvre son offre ; bouton **Statistiques** (candidatures par étape, délai de réponse).
- Panneau de détail : description, lien vers l'offre (modifiable), note détaillée et **saisie / correction de la note** (nouvelle entrée d'historique), **candidature** (prochaine action, date d'envoi, canal), **journal** (échéances en tête, retards en rouge ; ajouter, modifier, supprimer un événement, marquer une échéance faite ; lier un fichier du dossier choisi dans une liste), **fichiers du dossier** (liens qui les ouvrent), historique des statuts, tags éditables, changement de statut, bouton **Candidater** (copie `candidater <id>` dans le presse-papiers et passe l'offre en `go`).
- Fichiers : servis en lecture par `/api/fichier/<chemin>`, uniquement dans le dossier de données (pas de `..`, pas de fichiers cachés, ni `data/` ni `emails/`, liens symboliques résolus) ; Markdown rendu en HTML simple sans script (CSP), `?brut=1` pour le texte, PDF et images tels quels. Le serveur refuse les requêtes dont l'hôte n'est pas `localhost` / `127.0.0.1`.
- Thème clair / sombre / système, taille du texte réglable (mémorisés dans le navigateur), navigation au clavier (Entrée ouvre une offre, Échap ferme le panneau).

Développement de l'interface : `cap-emploi serve` d'un côté, `npm run dev:ui` de l'autre (Vite sur http://localhost:5173, l'API est relayée vers le port 4410 ; `CAP_EMPLOI_API` pour en changer).

## Suivi des candidatures généré

`cap-emploi generer-suivi` écrit le suivi au format de l'ancien `_SUIVI.md` : sections **En cours** (à envoyer d'abord, puis du dernier envoi au plus ancien), **Envoyées sans suite** (statut « sans nouvelles » ou « sans réponse »), **Closes** (refus, abandon, clôture), colonnes Offre, Type, Canal, Envoyé, Statut, Prochaine action, Dossier, liens vers les dossiers. En tête : « Fichier généré par cap-emploi le … : ne pas éditer à la main ».

Colonne Prochaine action : la prochaine échéance du journal (« **04/11** : Relancer », « (en retard) » si la date est passée), sinon le champ `prochaine_action`.

Tant qu'une candidature n'a pas bougé depuis la reprise, ses cellules sont réécrites telles quelles ; ensuite la colonne Statut reprend le commentaire du dernier statut. La prochaine action saisie dans l'interface, la CLI ou par MCP n'est jamais écrasée par une nouvelle reprise de l'ancien `_SUIVI.md`.

Bascule : comparer `_SUIVI.genere.md` à `_SUIVI.md`, puis `cap-emploi generer-suivi --remplacer`. Après la bascule, la base fait foi.

## Journal et échéances

**La base sait ce qui s'est passé et quand ; le dossier Markdown garde les documents.** Un événement a un type, une date (ou date-heure), un résumé, et au besoin : sens (envoyé / reçu), canal, interlocuteurs, montant + unité, jours, détails, fichiers (chemins relatifs au dossier de données). Une date future non faite est une échéance ; passée et non faite, elle est en retard.

Reprise (`import-historique`) : les sections « Suivi » des dossiers actifs (`candidatures/*/dossier-candidature.md`, pas `_archives/`) deviennent des événements d'origine `import` : lignes des tableaux Date | Événement, puces datées « - 13/10/2026 — … », cases cochées datées « - [x] Envoyée le : 13/10/2026 ». Les cases non cochées (à faire) ne sont pas reprises. Type deviné (message, entretien, test, proposition, décision ; `note` à défaut, listées dans le rapport), liens Markdown relatifs et chemins entre accents graves vers des fichiers existants. Idempotent : une empreinte par ligne ; une ligne disparue du dossier retire l'événement repris s'il n'a pas été modifié depuis. Un dossier qu'aucune candidature ne désigne est rattaché à la candidature sans dossier dont l'entreprise figure dans son nom (si elle est unique).

Une offre déjà suivie (`go` et au-delà) revue dans une alerte e-mail, un lot noté ou le registre ne change plus de statut ; l'alerte laisse une trace au journal (« Revue le … », une par jour).

## Développement

```sh
npm test            # Vitest (fixtures fictives dans tests/fixtures)
npm run typecheck   # TypeScript (serveur + interface)
npm run build       # typecheck + compilation de l'interface
```

Arborescence :

```
bin/cap-emploi.js   point d'entrée de la commande (Node exécute le TypeScript directement)
migrations/         schéma SQL versionné (PRAGMA user_version)
src/core/           configuration, liens, normalisation, opérations sur les offres, requêtes
src/db/             ouverture de la base et migrations
src/ingest/         lecture des .eml, JSON-LD, ingestion
src/import/         reprise de l'historique Markdown / JSON (dont les journaux des dossiers)
src/cli/            commandes
src/api/            serveur HTTP (Hono) : API JSON, lecture des fichiers du dossier, interface compilée
src/mcp/            serveur MCP (stdio), outils branchés sur src/core
src/export/         génération du suivi des candidatures (Markdown)
ui/                 interface React 19 + Vite + Tailwind CSS v4 + TanStack Table / Query
docs/adr/           décisions d'architecture
```

Voir aussi [`AGENTS.md`](AGENTS.md) (pilotage par une IA), [`docs/utiliser-avec-une-ia.md`](docs/utiliser-avec-une-ia.md) (brancher le serveur MCP), [`docs/adr/0001-choix-techniques.md`](docs/adr/0001-choix-techniques.md), [`docs/adr/0002-mcp-et-suivi.md`](docs/adr/0002-mcp-et-suivi.md) et [`docs/adr/0003-journal-et-echeances.md`](docs/adr/0003-journal-et-echeances.md).
