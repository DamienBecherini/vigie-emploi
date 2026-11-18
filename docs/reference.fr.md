<div align="center">

# vigie-emploi : référence

**Installation, espace de travail, CV, configuration, commandes, grille de notation, tableau de bord, suivi, journal et développement, en détail.**

[English](reference.md) · **Français** · [README](../README.fr.md) · [Serveur MCP](mcp.fr.md)

</div>

---

Ce document décrit l'application en détail. Les noms de commandes, de statuts et d'options sont les identifiants de l'application : ils sont les mêmes dans toutes les langues.

## Installation

Prérequis : Node.js 24 ou plus (SQLite est intégré à Node via `node:sqlite`, rien à compiler).

Depuis npm (le paquet contient le code compilé en JavaScript et l'interface compilée) :

```sh
npx vigie-emploi init                   # sans installation : crée ~/vigie-emploi
npm install -g vigie-emploi             # ou commande installée à demeure
```

Commande inscrite par `init` dans `.mcp.json` et dans les consignes de l'espace :

- lancé par `npx` : `npx -y vigie-emploi@<version>` (sous Windows, `cmd /c npx …` pour le serveur MCP). Le cache de npx peut être vidé : son chemin n'est jamais écrit. La version est figée pour que la base et l'application restent accordées ; au besoin, npx la retélécharge (connexion nécessaire). Les consignes de l'application (`AGENTS.md`, ou `AGENTS.en.md` pour un espace anglais) sont copiées dans `procedures/application.md`. Pour changer de version, remplacez le numéro dans `.mcp.json` et dans les consignes, ou passez à une installation globale ;
- installé (`npm install -g`, ou depuis le dépôt) : `node <chemin>/bin/vigie-emploi.js`, avec le chemin absolu de l'installation.

Depuis le dépôt (contributeurs) :

```sh
git clone https://github.com/DamienBecherini/vigie-emploi.git
cd vigie-emploi
npm install
npm run build      # vérifie les types, compile src/ dans dist/ et l'interface dans dist/ui
npm link           # rend la commande `vigie-emploi` disponible partout (facultatif)
```

Sans `npm link`, remplacez `vigie-emploi` par `node <chemin>/bin/vigie-emploi.js`. Dans le dépôt, `bin/vigie-emploi.js` exécute directement le TypeScript de `src/` ; sans `src/` (paquet npm), il charge le JavaScript compilé de `dist/`, car Node refuse d'exécuter du TypeScript situé sous `node_modules`. `npm pack` et `npm publish` recompilent tout (`prepack`).

## Créer son espace de travail

```sh
vigie-emploi init [dossier] [--port 4410] [--mcp-name vigie-emploi] [--template plain|modern|compact] [--language fr|en]
```

Sans dossier, `init` crée `~/vigie-emploi` (dossier personnel ; `~` est compris aussi sous PowerShell). Le dossier doit être neuf ou vide. `init` y copie le modèle d'espace (`scaffold-fr/`, ou `scaffold/` en anglais : consignes de l'IA, contexte à remplir, démarrage guidé, dossier `a-deposer/`, modèle de dossier de candidature), le gabarit de CV (`templates/cv/plain/`) et la grille d'exemple, puis écrit `vigie-emploi.config.json` et `.mcp.json` (serveur MCP lancé avec ce dossier de données). Il vérifie qu'un Chrome, Edge ou Chromium est disponible pour les PDF, et affiche le prompt de démarrage à donner à l'IA.

Pour essayer sans toucher à une installation existante : un autre dossier, un autre port et un autre nom de serveur MCP (`--port 4411 --mcp-name vigie-emploi-test`).

## Avec Claude Desktop ou un autre client MCP

Le serveur MCP (`vigie-emploi mcp`) suffit à une IA qui n'a ni accès à vos fichiers ni terminal, comme Claude Desktop : il crée l'espace de travail (`initialize_workspace`, sans passer par `init`), fournit les consignes en prompts (`onboarding`, `process-emails`, `prepare-go`, `targeted-cv`), lit vos documents déposés (texte, PDF, Word, images), écrit le contexte, les dossiers et les CV dans l'espace, et génère les PDF en montrant le rendu à l'IA ; il démarre aussi le tableau de bord (`open_dashboard`). Avec Claude Desktop, le plus simple est l'extension `.mcpb` ([Installation en un clic](../README.fr.md#installation-en-un-clic-claude-desktop)) ; on peut aussi déclarer le serveur à la main dans `claude_desktop_config.json`, avec le dossier de votre espace dans `VIGIE_EMPLOI_DATA` (par défaut `~/vigie-emploi`). Configuration et détails : [docs/mcp.fr.md](mcp.fr.md#claude-desktop).

Construire l'extension (pour une release GitHub) : `npm run mcpb` compile l'application, prépare `build/mcpb/vigie-emploi/` (JavaScript compilé, interface, modèles, gabarits, `node_modules` de production seulement), valide `mcpb/manifest.json` et emballe le tout dans `build/vigie-emploi-<version>.mcpb` (environ 7 Mo) avec l'outil officiel `@anthropic-ai/mcpb`. Joindre ce fichier à la release.

## CV en PDF

```sh
vigie-emploi cv "cv/<nom>.md" [--template <dossier>]
```

Convertit un CV Markdown en PDF A4 (Chrome, Edge ou Chromium sans interface ; `VIGIE_EMPLOI_BROWSER` pour imposer un chemin), écrit à côté du `.md`, et affiche le nombre de pages (cible : 2). Le gabarit est un dossier (`gabarit.css`, polices, `portrait.jpg|png|webp` facultatif) : `--template`, sinon `cv/gabarit/` de l'espace de travail, sinon celui de l'application. La structure Markdown attendue est décrite dans `scaffold/cv/LISEZMOI.md`.

## Configuration du dossier de données

Le dossier de données contient la base et la boîte de réception :

```
<dossier>/
  data/vigie-emploi.sqlite   base (créée au premier lancement)
  emails/                  .eml à ingérer (supprimés une fois traités)
  candidatures/            historique facultatif à reprendre (voir import-history)
  profil/grille.json       grille de notation (vigie-emploi rubric --init copie l'exemple)
```

Pour le désigner, au choix (du plus prioritaire au moins prioritaire) :

1. l'option `--data <dossier>` sur chaque commande ;
2. la variable d'environnement `VIGIE_EMPLOI_DATA` ;
3. un fichier `vigie-emploi.config.json` (non versionné) dans le dossier courant, dans le dossier de données ou à la racine de l'application. Modèle : [`vigie-emploi.config.example.json`](../vigie-emploi.config.example.json).

| Clé | Rôle | Défaut |
|---|---|---|
| `dataDir` | Dossier de données (chemin absolu ou relatif au fichier) | — |
| `database` | Chemin de la base | `<données>/data/vigie-emploi.sqlite` |
| `emails` | Boîte de réception | `<données>/emails` |
| `port` | Port du tableau de bord | `4410` |
| `fetchJsonLd` | Lire les pages Hellowork / Free-Work | `true` |
| `excludedTitles` | Expressions régulières (sans casse) : intitulés écartés sans lecture | `[]` |
| `rejectedEmployers` | Expressions régulières : employeurs refusés (intitulé, entreprise, début de la description) | `[]` |
| `terminal` | Commande qui ouvre un terminal avec l'agent (boutons du tableau de bord) ; `{folder}` et `{prompt}` y sont remplacés | Windows : `["wt.exe", "-d", "{folder}", "claude", "{prompt}"]` ; ailleurs : aucune |
| `mail` | Boîte mail relevée en IMAP : `user`, `host`, `port`, `secure`, `folder`, `sinceDays`, `markSeen` (écrite par le panneau « Boîte mail » ou `vigie-emploi mail setup` ; le mot de passe n'y est jamais) | aucune |
| `language` | Langue du tableau de bord, des messages de la CLI, des textes du serveur MCP montrés à l'utilisateur (ce que seule l'IA lit est en anglais) et du suivi généré : `fr` ou `en` (écrite par `init --language`, qui choisit aussi la langue des consignes de l'IA) ; le sélecteur de l'en-tête du tableau de bord l'emporte, pour ce navigateur. Une autre langue s'ajoute sans toucher à la logique : [docs/adding-a-language.fr.md](adding-a-language.fr.md) | celle du système à l'`init` ; `fr` pour un fichier de configuration qui n'en nomme aucune |

Variables d'environnement reconnues aussi : `VIGIE_EMPLOI_CONFIG` (fichier de config), `VIGIE_EMPLOI_DATABASE` (base), `VIGIE_EMPLOI_PORT`, `VIGIE_EMPLOI_LANGUAGE`, `VIGIE_EMPLOI_MAIL_PASSWORD` (mot de passe de la boîte mail, à la place du trousseau), `VIGIE_EMPLOI_BROWSER` (navigateur des PDF).

## Commandes

Toutes les commandes acceptent `--json` (sortie stable pour une IA), `--data` et `--config`. `vigie-emploi --help` donne la liste complète.

| Commande | Effet |
|---|---|
| `vigie-emploi mail [setup\|status\|fetch\|forget]` | Boîte mail relevée en IMAP (voir [Automatiser la réception des alertes](../README.fr.md#automatiser-la-réception-des-alertes)) : `setup` demande adresse, mot de passe et dossier (`--address`, `--host`, `--port`, `--insecure`, `--folder`, `--since-days`, `--no-mark-seen`, `--password-stdin`) ; `fetch` relève sans ingérer ; `forget` efface réglages et mot de passe |
| `vigie-emploi ingest [--keep] [--no-fetch] [--no-mail] [--emails <dossier>]` | Relève d'abord la boîte mail si elle est configurée (sauf `--no-mail`), puis lit les `.eml`, ajoute les nouvelles offres (`new`, ou `dismissed` avec le motif pour les intitulés exclus), puis **supprime les e-mails traités** (sauf `--keep`). Résumé : nouvelles, doublons, écartées, à lire |
| `vigie-emploi import-history` | Reprend `candidatures/_lots/*.json`, `candidatures/_ecartees.md`, `candidatures/_SUIVI.md` et les sections « Suivi » des `candidatures/*/dossier-candidature.md` (journal, voir plus bas) ; lecture seule, idempotent, avec un rapport des lignes non reconnues. Un `_SUIVI.md` généré par vigie-emploi n'est pas relu |
| `vigie-emploi list [filtres]` | Liste paginée : `--status a,b`, `--score-min`, `--score-max`, `--unscored`, `--source`, `--tag`, `--from` / `--until` (réception), `--text`, `--contract`, `--remote`, `--applications`, `--page`, `--size`, `--sort`, `--order` ; tri sur plusieurs niveaux : `--sort received_at:desc,score:desc` |
| `vigie-emploi show <id>` | Détail : description, notes, historique des statuts, tags, candidature |
| `vigie-emploi to-read [--limit N] [--full]` | Offres à traiter sans note, avec l'URL à lire, ou la description déjà extraite |
| `vigie-emploi score <id> --json '{…}'` | Enregistre une note pour une offre |
| `vigie-emploi score --file lot.json [--dry-run]` | Enregistre un lot de notes (offres retrouvées par `id` ou par `url`, créées au besoin) ; `--dry-run` calcule sans enregistrer |
| `vigie-emploi rubric [--instructions]` | Grille de notation courante : critères et poids, barèmes, règles, inventaire, exemples (`--instructions` : consignes pour l'IA) |
| `vigie-emploi rubric --update '{…}' --summary "…" [--dry-run]` | Changement partiel (poids, seuil, barèmes, règles, inventaire) ; nouvelle version et renotation, ou aperçu avec `--dry-run` |
| `vigie-emploi rubric --history` / `--version N` / `--restore N` / `--init` | Versions de la grille, retour à une version, copie de la grille d'exemple |
| `vigie-emploi rescore` | Recalcule les notes à critères avec la grille courante |
| `vigie-emploi status <id> <statut> [--comment "…"]` | Change le statut (historisé) |
| `vigie-emploi tag <id> +ajout -retrait` | Ajoute / retire des tags |
| `vigie-emploi apply <id>` | Passe l'offre en `go` et affiche ce qu'il faut pour préparer la candidature |
| `vigie-emploi application <id> [--folder] [--cv] [--channel] [--sent-at] [--message] [--next-action]` | Enregistre la candidature (`""` efface un champ) ; avec `--sent-at`, l'offre passe en `sent` |
| `vigie-emploi next-action <id> "texte"` | Prochaine action de la candidature (`-` pour l'effacer) |
| `vigie-emploi link <id> <url ou ->` | Lien de l'offre |
| `vigie-emploi event <id> --type <type> [--at "JJ/MM/AAAA HH:MM"] --summary "…" [--direction sent\|received] [--channel] [--contacts] [--details] [--amount 3000 --unit "€ HT"] [--days 6] [--file <chemin>]… [--done\|--no-done]` | Ajoute un événement au journal (types : `message`, `interview`, `test`, `proposal`, `decision`, `note`). `--at` : JJ/MM/AAAA, AAAA-MM-JJ, avec heure facultative, `demain`, `+3` ; par défaut maintenant. Daté dans le futur, il n'est pas fait : c'est une échéance |
| `vigie-emploi journal <id>` | Journal de la candidature : échéances d'abord (retards en tête), puis du plus récent au plus ancien |
| `vigie-emploi deadlines [--days 7]` | Échéances en retard et à venir sur N jours, toutes offres confondues |
| `vigie-emploi done <event_id> [--no-done]` | Marque une échéance comme faite (ou la rouvre) |
| `vigie-emploi files <id>` | Fichiers du dossier de candidature (chemins à citer dans `--file`) |
| `vigie-emploi stats` | Candidatures par étape (envoyée, réponse, entretien, proposition) et délai moyen avant la première réponse |
| `vigie-emploi generate-tracker [--output <fichier>] [--replace]` | Génère le suivi des candidatures depuis la base : `candidatures/_SUIVI.genere.md` par défaut (aperçu), `candidatures/_SUIVI.md` avec `--replace` |
| `vigie-emploi mcp` | Serveur MCP (stdio) pour une IA |
| `vigie-emploi serve [--port 4410] [--idle <minutes>]` | Lance le tableau de bord sur http://localhost:4410 ; avec `--idle`, il s'arrête seul après ce temps sans visite (`GET /api/health` donne le temps restant) |

Statuts : `new`, `to-read`, `scored`, `dismissed`, `go`, `sent`, `followed-up`, `interview`, `rejected`, `closed`, `withdrawn`. « Mes candidatures » regroupe `sent` et les suivants.

Format d'une note (celui des lots) :

```json
{
  "source": "linkedin", "url": "https://www.linkedin.com/jobs/view/1234567890/",
  "title": "…", "company": "…", "location": "…", "contract": "CDI", "compensation": "50-60 K€",
  "remote": "hybride", "published": "NC", "stack": "PHP, API",
  "criteria": {
    "technique": { "score": 8, "justification": "PHP, API REST ; écart : PostgreSQL" },
    "role": { "score": 7, "justification": "…" },
    "interet": { "score": 6, "justification": "…" },
    "risque": { "score": 7, "justification": "…" }
  },
  "inputs": { "onsite_days": 2, "salary_min": 55000, "salary_max": 65000, "unit": "year" },
  "blockers": [],
  "fit": "…", "gaps": "…", "read": true
}
```

Avec `criteria` (ou `inputs`, `blockers`), la note est **calculée** avec la grille ; un champ `score` fourni est ignoré et signalé dans `warnings`. La réponse contient la note, la valeur exacte et la décomposition. Sans `criteria`, c'est une note globale de l'ancienne grille (`score`, `raw_score`, `penalties`), qui reste figée. Champs facultatifs : `id` (à la place de `url`), `description`, `tags`. Les champs descriptifs ne complètent que ce qui manque ; la dernière note fait foi.

## Grille de notation

La grille vit dans `<données>/profil/grille.json` (modèle générique : [`examples/rubric.fr.json`](../examples/rubric.fr.json), copié par `vigie-emploi rubric --init`). Elle contient :

- **critères pondérés** (7 au plus) notés de 0 à 10 : par l'IA (`source: "ai"`, avec une consigne dans `description`) ou par l'application (`source: "computation"`, `computation: "remote"` ou `"compensation"`) ; poids relatifs, normalisés à 100 % ;
- **barèmes** : télétravail (sous-note pour 0 à 5 jours sur site, valeur « unknown ») ; rémunération (salaire en K€/an et TJM en €/j : plancher = 5, cible haute = 10, sous le plancher = 0, linéaire entre ; plancher full remote facultatif ; milieu, bas ou haut de fourchette) ;
- **règles bloquantes** : identifiant, libellé, effet `zero` ou `cap` + valeur, active ou non ;
- **inventaire de compétences** (technologie → fort / moyen / léger / zéro), lu par l'IA pour le critère technique ;
- **seuil « à regarder »** (vue rapide « Notées ≥ … ») ;
- **exemples de référence** (offres notées critère par critère, avec justification) pour caler l'IA ;
- **consignes** générales pour l'IA.

Calcul : moyenne pondérée des sous-notes → règles bloquantes (zéro, plafond) → arrondi au demi-point pour l'affichage et les filtres (la valeur exacte est gardée). Donnée manquante (critère non noté, télétravail ou salaire inconnus) : valeur neutre 5 et un **drapeau** sur l'offre. Les jours sur site et le salaire viennent de `inputs`, sinon des champs télétravail et rémunération de l'offre.

Chaque enregistrement (panneau, CLI, MCP, ou fichier modifié à la main) crée une **version** (numéro, date, auteur, résumé) et **recalcule toutes les notes à critères**, sans relire d'offre. Les anciennes notes globales restent telles quelles (badge « ancienne grille »). On peut revenir à une version précédente (elle devient une nouvelle version).

## Tableau de bord

`vigie-emploi serve`, puis http://localhost:4410 (écoute sur 127.0.0.1 uniquement). `--idle <minutes>` l'arrête après une période sans activité.

Sans terminal (Claude Desktop) : demandez à l'IA d'ouvrir le tableau de bord. L'outil MCP `open_dashboard` le démarre en arrière-plan s'il ne tourne pas déjà (processus séparé qui survit au redémarrage du serveur MCP et s'arrête après 60 minutes sans activité), sur le port de l'espace ou le suivant libre, et renvoie l'adresse à cliquer ; `open: true` l'ouvre dans le navigateur par défaut. Il lui faut un `node` (24 ou plus) installé ; sinon il tourne dans le processus du serveur MCP, tant que Claude Desktop reste ouvert.

- Tableau paginé côté serveur (25 à 500 lignes par page), tri par colonne à la Thunderbird (le dernier en-tête cliqué devient le tri principal, le précédent passe en secondaire : cliquer Note puis Reçue le trie par date, puis par note à date égale ; l'adresse garde les niveaux), colonnes masquables.
- Filtres : note, dates de réception et de publication, source, statut, contrat, télétravail, tags, recherche plein texte (accents ignorés). Les filtres sont dans l'URL : on peut la garder en favori.
- Vues rapides : à traiter, notées ≥ seuil de la grille (4,5 par défaut), mes candidatures.
- **Réglages de la note** (bouton de l'en-tête) : curseurs des poids (total normalisé affiché), seuil, barèmes télétravail et rémunération, règles bloquantes (activer, effet, plafond, ajout, suppression), inventaire (ajout, modification, suppression, filtre), exemples de référence recalculés en direct ; **aperçu avant d'enregistrer** (offres dont la note change, offres qui franchissent le seuil, cliquables) ; résumé du changement obligatoire ; historique des versions et restauration.
- **Boîte mail** (bouton de l'en-tête) : connexion à la boîte relevée en IMAP (messagerie reconnue d'après l'adresse, aide au mot de passe d'application, choix du dossier), relève immédiate, oubli de la boîte.
- **Travail pour l'agent**, au-dessus des filtres : « Relever la boîte mail » (si une boîte est connectée et que rien n'attend), « Traiter N e-mails » (des `.eml` attendent dans la boîte de réception) et « Préparer N candidatures » (offres en `go` sans dossier). Chaque bouton ouvre un terminal dans le dossier de données avec l'agent et la commande `/traiter-emails` ou `/preparer-go` (à fournir par le dossier de données, par exemple sous forme de skills Claude Code) ; la suite se passe dans ce terminal. Voir [ADR 0005](adr/0005-agent-buttons-and-notifications.fr.md).
- **Mise à jour en direct** : le serveur prévient la page (Server-Sent Events, `/api/stream`) quand la base change, quelle que soit l'origine de l'écriture (CLI, agent, autre onglet), et quand la boîte de réception change ; la page recharge alors ses données. Le bouton « Rafraîchir » reste disponible.
- Bandeau **À venir** au-dessus du tableau : échéances en retard et des 7 prochains jours, chacune ouvre son offre ; bouton **Statistiques** (candidatures par étape, délai de réponse).
- Panneau de détail : description, lien vers l'offre (modifiable), **décomposition de la note** (critère par critère : sous-note, poids, apport, justification, origine ; règles appliquées ; drapeaux ; valeur exacte et version de la grille), badge « ancienne grille » pour une note globale, **correction des sous-notes** (critères IA, jours sur site, salaire, règles ; la note est recalculée et s'ajoute à l'historique), note globale à l'ancienne, **candidature** (prochaine action, date d'envoi, canal), **journal** (échéances en tête, retards en rouge ; ajouter, modifier, supprimer un événement, marquer une échéance faite ; lier un fichier du dossier choisi dans une liste), **fichiers du dossier** (liens qui les ouvrent), historique des statuts, tags éditables, changement de statut, bouton **Candidater** (copie `apply <id>` dans le presse-papiers et passe l'offre en `go`).
- Fichiers : servis en lecture par `/api/file/<chemin>`, uniquement dans le dossier de données (pas de `..`, pas de fichiers cachés, ni `data/` ni `emails/`, liens symboliques résolus) ; Markdown rendu en HTML simple sans script (CSP), `?raw=1` pour le texte, PDF et images tels quels. Le serveur refuse les requêtes dont l'hôte n'est pas `localhost` / `127.0.0.1`, et les écritures venues d'une autre origine (en-tête `Origin` non local ou `Sec-Fetch-Site: cross-site`).
- Langue (sélecteur de l'en-tête), thème clair / sombre / système et palettes, taille du texte (mémorisés dans le navigateur), navigation au clavier (Entrée ouvre une offre, Échap ferme le panneau). Sur téléphone, les filtres s'ouvrent dans un tiroir.

Développement de l'interface : `vigie-emploi serve` d'un côté, `npm run dev:ui` de l'autre (Vite sur http://localhost:5173, l'API est relayée vers le port 4410 ; `VIGIE_EMPLOI_API` pour en changer).

## Suivi des candidatures généré

`vigie-emploi generate-tracker` écrit le suivi en Markdown (`candidatures/_SUIVI.md`), lisible sans l'application : sections **En cours** (à envoyer d'abord, puis du dernier envoi au plus ancien), **Envoyées sans suite** (statut « sans nouvelles » ou « sans réponse »), **Closes** (refus, abandon, clôture), colonnes Offre, Type, Canal, Envoyé, Statut, Prochaine action, Dossier, liens vers les dossiers. En tête : « Fichier généré par vigie-emploi le … : ne pas éditer à la main ».

Colonne Prochaine action : la prochaine échéance du journal (« **04/11** : Relancer », « (en retard) » si la date est passée), sinon le champ `next_action`.

La base fait foi : le fichier est régénéré, jamais relu. Si vous reprenez un suivi Markdown existant (`import-history`), tant qu'une candidature reprise n'a pas bougé, ses cellules sont réécrites telles quelles ; la prochaine action saisie dans l'interface, la CLI ou par MCP n'est jamais écrasée par une nouvelle reprise. Avant de remplacer un ancien `_SUIVI.md`, comparez-le à l'aperçu `_SUIVI.genere.md`.

## Journal et échéances

**La base sait ce qui s'est passé et quand ; le dossier Markdown garde les documents.** Un événement a un type, une date (ou date-heure), un résumé, et au besoin : sens (envoyé / reçu), canal, interlocuteurs, montant + unité, jours, détails, fichiers (chemins relatifs au dossier de données). Une date future non faite est une échéance ; passée et non faite, elle est en retard.

Reprise (`import-history`) : les sections « Suivi » des dossiers actifs (`candidatures/*/dossier-candidature.md`, pas `_archives/`) deviennent des événements d'origine `import` : lignes des tableaux Date | Événement, puces datées « - 13/10/2026 — … », cases cochées datées « - [x] Envoyée le : 13/10/2026 ». Les cases non cochées (à faire) ne sont pas reprises. Type deviné (message, entretien, test, proposition, décision ; `note` à défaut, listées dans le rapport), liens Markdown relatifs et chemins entre accents graves vers des fichiers existants. Idempotent : une empreinte par ligne ; une ligne disparue du dossier retire l'événement repris s'il n'a pas été modifié depuis. Une ligne déjà saisie à la main (CLI, MCP, tableau de bord : même offre, même type, même jour, sens compatible) n'est pas reprise, pour qu'une nouvelle reprise ne double pas le journal ; le rapport les compte. Un dossier qu'aucune candidature ne désigne est rattaché à la candidature sans dossier dont l'entreprise figure dans son nom (si elle est unique).

Une offre déjà suivie (`go` et au-delà) revue dans une alerte e-mail, un lot noté ou le registre ne change plus de statut ; l'alerte laisse une trace au journal (« Revue le … », une par jour).

## Développement

```sh
npm test            # Vitest (fixtures fictives dans tests/fixtures)
npm run typecheck   # TypeScript (serveur + interface)
npm run build       # typecheck + compilation de l'interface
npm run lint        # Biome : lint et contrôle de la mise en forme (npm run format réécrit)
npm run coverage    # tests avec la couverture de src/
npm run check       # tout ce que lance la CI : typecheck, lint, build, tests
npm run mcpb        # extension Claude Desktop : build/vigie-emploi-<version>.mcpb
```

Captures du README et CV d'exemple (données fictives, en français et en anglais) :

```sh
node scripts/demo/demo.ts ../demo-fr fr                  # espace de démonstration (14 offres, candidatures, échéances)
node scripts/demo/captures.mjs ../demo-fr fr             # docs/screenshots/dashboard.fr.png, detail-offre.png, boite-mail.png (après npm run build)
bash scripts/demo/cv-exemples.sh                         # docs/examples/*.pdf et docs/screenshots/cv-*.png (pypdfium2 requis)
```

Comment le code s'articule, et pourquoi : [`code.fr.md`](code.fr.md). Comment contribuer : [`CONTRIBUTING.fr.md`](../CONTRIBUTING.fr.md).

Arborescence :

```
bin/vigie-emploi.js   point d'entrée de la commande (TypeScript de src/ dans le dépôt, JavaScript de dist/ dans le paquet npm)
migrations/           schéma SQL versionné (PRAGMA user_version)
src/core/             configuration, liens, normalisation, opérations sur les offres, requêtes, erreurs,
                      grille de notation (rubric/ : schéma et calcul purs ; rubric-storage.ts : fichier, versions, renotation)
src/sources/          un adaptateur par site d'offres (reconnaissance des liens, lecture de la page, particularités des e-mails)
src/db/               ouverture de la base et migrations
src/ingest/           lecture des .eml, ingestion, téléchargement d'une page publique
src/mail/             relève IMAP, mot de passe dans le trousseau du système, messageries connues
src/import/           reprise d'un historique Markdown / JSON (dont les journaux des dossiers)
src/cli/              ligne de commande : point d'entrée, options, un fichier par groupe de commandes dans commands/
src/api/              serveur HTTP (Hono) : API JSON (routes/), lecture des fichiers du dossier, interface compilée
src/mcp/              serveur MCP (stdio), outils branchés sur src/core (tools/) ; textes dans src/mcp/i18n/
src/cv/               CV Markdown → PDF (Chrome sans interface), gabarits, comptage des pages
src/init/             création d'un espace de travail
src/i18n/             mécanisme de traduction et textes de la CLI, de l'API et du suivi
src/export/           génération du suivi des candidatures (Markdown)
ui/                   interface React 19 + Vite + Tailwind CSS v4 + TanStack Table / Query (textes dans ui/src/i18n/)
scaffold/, scaffold-fr/   modèle d'espace de travail copié par init, en anglais et en français (consignes de l'IA, démarrage, exemple de CV)
templates/cv/          gabarits de CV (`plain`, `modern`, `compact`)
examples/             grilles de notation d'exemple (française et anglaise)
mcpb/, scripts/       extension Claude Desktop (manifeste, construction) ; scripts/demo/ : espace de démo, captures, CV d'exemple
docs/adr/             décisions d'architecture
```

Voir aussi [`AGENTS.fr.md`](../AGENTS.fr.md) (pilotage par une IA), [`mcp.fr.md`](mcp.fr.md) (brancher le serveur MCP), [`adding-a-language.fr.md`](adding-a-language.fr.md) et les décisions d'architecture : [0001](adr/0001-technical-choices.fr.md) (choix techniques), [0002](adr/0002-mcp-and-tracker.fr.md) (MCP et suivi), [0003](adr/0003-journal-and-deadlines.fr.md) (journal et échéances), [0004](adr/0004-scoring-grid.fr.md) (grille de notation), [0005](adr/0005-agent-buttons-and-notifications.fr.md) (boutons de l'agent et notifications), [0006](adr/0006-redesign-0-7.fr.md) (la refonte 0.7).
