# Utiliser vigie-emploi avec une IA (serveur MCP)

[English](mcp.md) · **Français** · [README](../README.fr.md) · [Référence](reference.fr.md)

`vigie-emploi mcp` lance un serveur [MCP](https://modelcontextprotocol.io) sur l'entrée / sortie standard (transport stdio). Une IA (Claude Code, Claude Desktop ou tout client MCP) y trouve les outils pour ingérer les alertes, lire, noter, candidater et générer le suivi, sans passer par la ligne de commande. Le serveur appelle le même noyau que la CLI et le tableau de bord ; il n'appelle lui-même aucun modèle d'IA.

Le serveur suffit aussi à un client **sans accès aux fichiers ni au terminal** (Claude Desktop) : il crée l'espace de travail, expose les consignes de l'espace en prompts, lit et écrit les fichiers de l'espace et génère les CV en PDF (voir « Claude Desktop » plus bas).

Le dossier de données est résolu comme pour la CLI : `--data <dossier>`, sinon `VIGIE_EMPLOI_DATA`, sinon `vigie-emploi.config.json` (dossier courant, dossier de données ou racine de l'application), sinon, pour le serveur MCP seulement, le dossier par défaut **`~/vigie-emploi`** (`C:\Users\<nom>\vigie-emploi` sous Windows). Si ce dossier n'existe pas ou est vide, le serveur démarre quand même : les outils de données répondent « espace non initialisé » et l'outil `initialize_workspace` le crée. Le serveur garde la base ouverte tant que le client tourne ; la CLI et le tableau de bord peuvent s'en servir en même temps (attente de 5 s sur un verrou).

## Outils

| Outil | Rôle |
|---|---|
| `list_offers` | Liste paginée, mêmes filtres que `vigie-emploi list` (statuts, note min / max, sans note, sources, tags, texte, dates, contrat, télétravail, candidatures, tri sur un ou plusieurs niveaux : `received_at:desc,score:desc`) |
| `read_offer` | Détail complet : description, notes, historique des statuts, tags, candidature |
| `offers_to_read` | Offres à traiter sans note, avec `reading` = `description`, `browser` ou `human` |
| `rubric` | Grille de notation courante : critères et poids, barèmes, règles bloquantes, inventaire, exemples (avec leur note calculée), seuil, consignes de notation |
| `score_offer` | Une note (par `id`, ou par `url` : l'offre est créée au besoin) : `criteria`, `inputs`, `blockers` ; la note finale est calculée et renvoyée avec sa décomposition |
| `score_batch` | Plusieurs notes au format des lots, tout ou rien ; `dry_run: true` calcule sans enregistrer |
| `update_rubric` | Changement partiel de la grille (poids, seuil, barèmes, règles, inventaire) avec un résumé ; `dry_run: true` pour l'aperçu ; `restore_version` ; renvoie l'impact (notes qui changent, offres qui franchissent le seuil) |
| `rescore` | Recalcule les notes à critères avec la grille courante |
| `rubric_history` | Versions de la grille (date, auteur, résumé) |
| `change_status` | Statut + commentaire (historisé) |
| `update_tags` | Ajout / retrait de tags |
| `update_link` | Lien de l'offre (ou `null` pour l'effacer) |
| `apply` | Passe en `go`, renvoie l'offre, le dossier de données, un dossier suggéré et les étapes |
| `save_application` | Dossier, CV, canal, date d'envoi, message, prochaine action ; avec une date d'envoi, l'offre passe en `sent` |
| `add_event` | Événement daté au journal (message, entretien, test, proposition, décision, note) ; daté dans le futur et pas fait, c'est une échéance |
| `update_event` | Corrige un événement (champ absent inchangé, `null` efface) |
| `journal` | Journal d'une offre : échéances d'abord, puis du plus récent au plus ancien |
| `deadlines` | Échéances en retard et à venir sur N jours (7 par défaut), toutes offres |
| `mark_done` | Marque une échéance comme faite (ou la rouvre) |
| `folder_files` | Fichiers du dossier de candidature (chemins à citer dans un événement) |
| `ingest_emails` | Relève d'abord la boîte mail si elle est configurée (voir le README), puis lit les `.eml` de `emails/` et les supprime (sauf `keep: true`) ; `to_tell` dit ce qui a été relevé, ou pourquoi la boîte ne l'a pas été |
| `generate_tracker` | Écrit `candidatures/_SUIVI.genere.md` (aperçu), ou `_SUIVI.md` avec `replace: true` |

Espace, fichiers et CV (pour un client sans accès aux fichiers ni au terminal) :

| Outil | Rôle |
|---|---|
| `workspace_state` | Dossier de l'espace, initialisé ou non, démarrage fait ou non, navigateur trouvé pour les PDF, gabarit installé |
| `initialize_workspace` | Crée l'espace (comme `vigie-emploi init`) dans le dossier du serveur ou celui choisi par l'utilisateur, puis s'y installe |
| `list_files` | Contenu d'un dossier de l'espace, sur 1 à 4 niveaux |
| `read_file` | Texte tel quel ; PDF : texte extrait page par page ; Word (`.docx`) : texte ; image : contenu `image` |
| `write_file` | Crée ou remplace un fichier texte (`.md`, `.txt`, `.json`, `.csv`, `.yml`, `.css`), dossiers parents compris ; renvoie `existed` ; `create_only: true` refuse d'écraser |
| `move_file` | Déplace ou renomme un fichier, sans jamais écraser |
| `generate_cv` | CV Markdown → PDF à côté, avec le gabarit de l'espace ; nombre de pages, `pdf_existed` ; `capture: true` joint l'image PNG du rendu |
| `count` | Caractères et mots de chaque bloc à copier-coller d'un texte ou d'un fichier |
| `list_templates`, `choose_template` | Gabarits de CV livrés ; installation dans `cv/gabarit` (l'ancien est gardé) |
| `open_dashboard` | Démarre le tableau de bord en arrière-plan s'il ne tourne pas déjà, et renvoie son adresse (`open: true` l'ouvre dans le navigateur par défaut) ; voir « Tableau de bord sans terminal » |

**Sécurité des outils fichiers** : tout chemin est relatif à l'espace (un chemin absolu n'est accepté que s'il est dans l'espace) ; `..`, les fichiers et dossiers cachés (`.mcp.json`, `.git`…), `data/` (la base, qui ne se modifie que par les outils de l'application) et les liens symboliques qui sortent de l'espace sont refusés. Aucun outil ne supprime de fichier ; l'écriture se limite aux fichiers texte.

### Prompts et ressource

Les consignes de l'espace sont relues sur le disque à chaque appel (l'utilisateur ou l'IA peut les modifier) :

| Prompt | Contenu |
|---|---|
| `onboarding` | `AGENTS.md` puis `DEMARRAGE.md` : premier entretien ou reprise. Sans espace, il demande à l'IA de le créer d'abord (`initialize_workspace`) |
| `process-emails` | `AGENTS.md` puis `procedures/traiter-emails.md` |
| `prepare-go` | `AGENTS.md` puis `procedures/preparer-go.md` |
| `targeted-cv` | `AGENTS.md` puis `procedures/cv-cible.md` (argument facultatif `offer`) |

La ressource `vigie-emploi://workspace/AGENTS.md` donne les consignes générales seules ; les `instructions` du serveur renvoient vers elles.

Les erreurs (offre introuvable, note hors échelle, lien invalide…) reviennent à l'IA comme résultat d'erreur lisible ; le serveur continue.

## Claude Code

Fichier `.mcp.json` à la racine du dossier de données (ou du projet où l'on travaille) :

```json
{
  "mcpServers": {
    "vigie-emploi": { "command": "vigie-emploi", "args": ["mcp"] }
  }
}
```

`init` écrit ce fichier lui-même. Testé sous Windows 11 avec Claude Code : les trois formes ci-dessous se connectent et exposent les 33 outils.

| Forme | `command` / `args` | Quand l'utiliser |
|---|---|---|
| Commande seule | `"vigie-emploi"`, `["mcp"]` | Claude Code (il retrouve le `vigie-emploi.cmd` de `npm link`) |
| Via `cmd` | `"cmd"`, `["/c", "vigie-emploi", "mcp"]` | Clients Windows qui lancent le programme sans shell |
| Node direct | `"node"`, `["C:/chemin/vigie-emploi/bin/vigie-emploi.js", "mcp"]` | Partout, sans `npm link` ; la forme la plus robuste |

Lancé sans shell (`child_process.spawn('vigie-emploi')`), `vigie-emploi` seul échoue sous Windows (`ENOENT` : npm crée un `.cmd`, pas un `.exe`) ; d'où les deux autres formes pour les clients génériques.

Pour imposer le dossier de données : ajouter `"--data", "D:/chemin/donnees"` aux `args`, ou `"env": { "VIGIE_EMPLOI_DATA": "D:/chemin/donnees" }`.

En ligne de commande : `claude mcp add vigie-emploi -- vigie-emploi mcp` (portée locale), ou `claude mcp add --scope project …` pour écrire `.mcp.json`. Au premier lancement, Claude Code demande d'approuver un serveur déclaré dans `.mcp.json`.

## Claude Desktop

Claude Desktop n'a ni accès aux fichiers ni terminal : tout passe par le serveur, y compris la création de l'espace et l'ouverture du tableau de bord. Aucune commande à taper.

### Extension en un clic (recommandé)

**1. Installer** : double-clic sur `vigie-emploi-<version>.mcpb` (ou le glisser dans la fenêtre de Claude Desktop, ou Paramètres → Extensions → Paramètres avancés → Installer une extension…). Claude Desktop affiche les outils et demande deux réglages :

- **Dossier de l'espace** : par défaut `vigie-emploi` dans votre dossier personnel. Il peut ne pas exister encore. Évitez un dossier synchronisé (OneDrive, Dropbox…) : la base SQLite s'y abîme facilement ;
- **Langue** : `fr` ou `en` (consignes de l'IA, tableau de bord, suivi).

Pour les changer ensuite : Paramètres → Extensions → vigie-emploi → Configurer.

**2. Démarrer** : voir l'étape 2 plus bas (prompt `onboarding`).

L'extension contient l'application compilée et ses dépendances ; Claude Desktop la lance avec son Node intégré (Node 24.22 dans Claude Desktop 5.11492, novembre 2026), qui comprend `node:sqlite`. Le manifeste exige Node 24 ou plus (`compatibility.runtimes.node`) : si un jour le Node intégré était plus ancien, Claude Desktop prendrait un `node` du système assez récent, et à défaut le serveur s'arrête avec un message clair (« installer Node 24 ou plus récent »), visible dans le journal de l'extension.

**Si vous aviez déclaré le serveur à la main** (section suivante) : retirez cette entrée de `claude_desktop_config.json` avant d'installer l'extension, sinon Claude aura deux serveurs `vigie-emploi` aux outils identiques.

Construire l'extension : `npm run mcpb` dans le dépôt (voir le README).

### Déclaration à la main

**1. Déclarer le serveur** dans `claude_desktop_config.json` (Paramètres → Développeur → Modifier la configuration) :

- Windows, installation classique : `%APPDATA%\Claude\claude_desktop_config.json` ;
- Windows, installation par le Microsoft Store : Claude Desktop range ses données dans `%LOCALAPPDATA%\Claude-Data\claude_<identifiant>\claude_desktop_config.json` (par exemple `claude_pzs8sxrjxfjjc`) ; le menu ci-dessus ouvre le bon fichier ;
- macOS : `~/Library/Application Support/Claude/claude_desktop_config.json`.

```json
{
  "mcpServers": {
    "vigie-emploi": {
      "command": "node",
      "args": ["C:/chemin/vigie-emploi/bin/vigie-emploi.js", "mcp"],
      "env": { "VIGIE_EMPLOI_DATA": "C:/Users/vous/vigie-emploi" }
    }
  }
}
```

`command` : `node` doit être trouvé dans le `PATH` ; sinon, son chemin complet (`C:/Program Files/nodejs/node.exe`, `/usr/local/bin/node` ou `/opt/homebrew/bin/node` sur macOS). `args` : le chemin du `bin/vigie-emploi.js` de l'application, avec des barres obliques. `env.VIGIE_EMPLOI_DATA` : le dossier de votre espace de travail ; sans lui, le serveur prend `~/vigie-emploi`. Le dossier courant de Claude Desktop n'est pas fiable : indiquez toujours le dossier par `env` (ou `"--data", "<dossier>"` dans `args`). Redémarrez Claude Desktop (quitter complètement, pas seulement fermer la fenêtre) après chaque modification.

**2. Démarrer** : dans une nouvelle conversation, bouton « + » → vigie-emploi → prompt **`onboarding`**. Si l'espace n'existe pas encore, l'IA propose de le créer (`initialize_workspace`, dans le dossier configuré ou celui que vous choisissez), puis vous demande de déposer votre CV et l'export PDF de votre profil LinkedIn dans `a-deposer/` avec l'explorateur de fichiers. Si vous choisissez un autre dossier que celui de la configuration, reportez-le dans le réglage « Dossier de l'espace » de l'extension (ou dans `VIGIE_EMPLOI_DATA`) : sinon la session suivante repartira du dossier configuré.

**3. Les alertes** : pour que l'application relève elle-même vos alertes d'offres, demandez « ouvre mon tableau de bord », puis bouton **« Boîte mail »** : adresse, mot de passe (tapé dans la page, jamais dans la conversation), dossier des alertes. Voir « Automatiser la réception des alertes » dans le README.

**4. Ensuite** : prompts `process-emails`, `prepare-go` et `targeted-cv`, ou simplement vos demandes en clair (« traite les e-mails », « reprends le démarrage »). Les CV se génèrent par `generate_cv` ; l'IA voit le rendu (capture) et vous donne le chemin du PDF. C'est vous qui envoyez les candidatures.

**Tableau de bord sans terminal** : demandez « ouvre mon tableau de bord ». L'outil `open_dashboard` vérifie `/api/health` sur le port de l'espace (4410 par défaut) ; si le tableau de bord de cet espace ne tourne pas, il le démarre (`vigie-emploi serve --idle 60`) dans un processus séparé, détaché du serveur MCP : il survit à un redémarrage du serveur et s'arrête seul après 60 minutes sans activité. Port pris par autre chose : il essaie les neuf suivants. L'outil renvoie l'adresse à cliquer ; avec `open: true`, il l'ouvre dans le navigateur par défaut. Il faut pour cela un `node` 24 ou plus dans le `PATH` (le Node intégré de Claude Desktop ne peut pas lancer de processus séparé) ; sans lui, le tableau de bord tourne dans le processus du serveur MCP et s'arrête avec Claude Desktop.

Limites : l'IA ne lit pas LinkedIn, Indeed ni Glassdoor (pas de navigateur dans Claude Desktop sans extension) : collez le texte des offres quand elle le demande. Un PDF scanné, sans texte, ne se lit pas : glissez-le directement dans la conversation.

## Client générique

Tout client MCP stdio convient : lancer `node <chemin>/bin/vigie-emploi.js mcp [--data <dossier>]` et échanger du JSON-RPC sur stdin / stdout (un message par ligne). stdout ne porte que le protocole ; les messages de l'application (« vigie-emploi MCP prêt ») sortent sur stderr. Exemple avec le SDK TypeScript :

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'mon-client', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: 'node', args: ['C:/chemin/vigie-emploi/bin/vigie-emploi.js', 'mcp'] }));
const r = await client.callTool({ name: 'offers_to_read', arguments: { limit: 10 } });
```

Inspecteur officiel, pour essayer les outils à la main : `npx @modelcontextprotocol/inspector node bin/vigie-emploi.js mcp --data <dossier>`.

## Flux type

Voir [`AGENTS.fr.md`](../AGENTS.fr.md) : ingérer → lire → lire la grille (`rubric`) → noter les critères (`score_batch`) → candidater → enregistrer la candidature → tenir le journal (événements, échéances) → générer le suivi.
