# Utiliser postuler-juste avec une IA (serveur MCP)

`postuler-juste mcp` lance un serveur [MCP](https://modelcontextprotocol.io) sur l'entrée / sortie standard (transport stdio). Une IA (Claude Code, Claude Desktop ou tout client MCP) y trouve les outils pour ingérer les alertes, lire, noter, candidater et générer le suivi, sans passer par la ligne de commande. Le serveur appelle le même noyau que la CLI et le tableau de bord ; il n'appelle lui-même aucun modèle d'IA.

Le serveur suffit aussi à un client **sans accès aux fichiers ni au terminal** (Claude Desktop) : il crée l'espace de travail, expose les consignes de l'espace en prompts, lit et écrit les fichiers de l'espace et génère les CV en PDF (voir « Claude Desktop » plus bas).

Le dossier de données est résolu comme pour la CLI : `--data <dossier>`, sinon `POSTULER_JUSTE_DATA`, sinon `postuler-juste.config.json` (dossier courant, dossier de données ou racine de l'application), sinon, pour le serveur MCP seulement, le dossier par défaut **`~/ma-recherche`** (`C:\Users\<nom>\ma-recherche` sous Windows). Si ce dossier n'existe pas ou est vide, le serveur démarre quand même : les outils de données répondent « espace non initialisé » et l'outil `initialiser_espace` le crée. Le serveur garde la base ouverte tant que le client tourne ; la CLI et le tableau de bord peuvent s'en servir en même temps (attente de 5 s sur un verrou).

## Outils

| Outil | Rôle |
|---|---|
| `lister_offres` | Liste paginée, mêmes filtres que `postuler-juste list` (statuts, note min / max, sans note, sources, tags, texte, dates, contrat, télétravail, candidatures, tri sur un ou plusieurs niveaux : `recue_le:desc,note:desc`) |
| `lire_offre` | Détail complet : description, notes, historique des statuts, tags, candidature |
| `offres_a_lire` | Offres à traiter sans note, avec `lecture` = `description`, `navigateur` ou `humain` |
| `grille` | Grille de notation courante : critères et poids, barèmes, règles bloquantes, inventaire, exemples (avec leur note calculée), seuil, consignes de notation |
| `noter_offre` | Une note (par `id`, ou par `url` : l'offre est créée au besoin) : `criteres`, `entrees`, `bloquants` ; la note finale est calculée et renvoyée avec sa décomposition |
| `noter_lot` | Plusieurs notes au format des lots, tout ou rien ; `essai: true` calcule sans enregistrer |
| `modifier_grille` | Changement partiel de la grille (poids, seuil, barèmes, règles, inventaire) avec un résumé ; `essai: true` pour l'aperçu ; `restaurer_version` ; renvoie l'impact (notes qui changent, offres qui franchissent le seuil) |
| `renoter` | Recalcule les notes à critères avec la grille courante |
| `historique_grille` | Versions de la grille (date, auteur, résumé) |
| `changer_statut` | Statut + commentaire (historisé) |
| `modifier_tags` | Ajout / retrait de tags |
| `modifier_lien` | Lien de l'offre (ou `null` pour l'effacer) |
| `candidater` | Passe en `go`, renvoie l'offre, le dossier de données, un dossier suggéré et les étapes |
| `enregistrer_candidature` | Dossier, CV, canal, date d'envoi, message, prochaine action ; avec une date d'envoi, l'offre passe en `envoyee` |
| `ajouter_evenement` | Événement daté au journal (message, entretien, test, proposition, décision, note) ; daté dans le futur et pas fait, c'est une échéance |
| `modifier_evenement` | Corrige un événement (champ absent inchangé, `null` efface) |
| `journal` | Journal d'une offre : échéances d'abord, puis du plus récent au plus ancien |
| `echeances` | Échéances en retard et à venir sur N jours (7 par défaut), toutes offres |
| `marquer_fait` | Marque une échéance comme faite (ou la rouvre) |
| `fichiers_dossier` | Fichiers du dossier de candidature (chemins à citer dans un événement) |
| `ingerer_emails` | Lit les `.eml` puis les supprime (sauf `garder: true`) |
| `generer_suivi` | Écrit `candidatures/_SUIVI.genere.md` (aperçu), ou `_SUIVI.md` avec `remplacer: true` |

Espace, fichiers et CV (pour un client sans accès aux fichiers ni au terminal) :

| Outil | Rôle |
|---|---|
| `etat_espace` | Dossier de l'espace, initialisé ou non, démarrage fait ou non, navigateur trouvé pour les PDF, gabarit installé |
| `initialiser_espace` | Crée l'espace (comme `postuler-juste init`) dans le dossier du serveur ou celui choisi par l'utilisateur, puis s'y installe |
| `lister_fichiers` | Contenu d'un dossier de l'espace, sur 1 à 4 niveaux |
| `lire_fichier` | Texte tel quel ; PDF : texte extrait page par page ; Word (`.docx`) : texte ; image : contenu `image` |
| `ecrire_fichier` | Crée ou remplace un fichier texte (`.md`, `.txt`, `.json`, `.csv`, `.yml`, `.css`), dossiers parents compris ; renvoie `existait` ; `creer_seulement: true` refuse d'écraser |
| `deplacer_fichier` | Déplace ou renomme un fichier, sans jamais écraser |
| `generer_cv` | CV Markdown → PDF à côté, avec le gabarit de l'espace ; nombre de pages, `pdf_existait` ; `capture: true` joint l'image PNG du rendu |
| `compter` | Caractères et mots de chaque bloc à copier-coller d'un texte ou d'un fichier |
| `lister_gabarits`, `choisir_gabarit` | Gabarits de CV livrés ; installation dans `cv/gabarit` (l'ancien est gardé) |

**Sécurité des outils fichiers** : tout chemin est relatif à l'espace (un chemin absolu n'est accepté que s'il est dans l'espace) ; `..`, les fichiers et dossiers cachés (`.mcp.json`, `.git`…), `data/` (la base, qui ne se modifie que par les outils de l'application) et les liens symboliques qui sortent de l'espace sont refusés. Aucun outil ne supprime de fichier ; l'écriture se limite aux fichiers texte.

### Prompts et ressource

Les consignes de l'espace sont relues sur le disque à chaque appel (l'utilisateur ou l'IA peut les modifier) :

| Prompt | Contenu |
|---|---|
| `demarrage` | `AGENTS.md` puis `DEMARRAGE.md` : premier entretien ou reprise. Sans espace, il demande à l'IA de le créer d'abord (`initialiser_espace`) |
| `traiter-emails` | `AGENTS.md` puis `procedures/traiter-emails.md` |
| `preparer-go` | `AGENTS.md` puis `procedures/preparer-go.md` |
| `cv-cible` | `AGENTS.md` puis `procedures/cv-cible.md` (argument facultatif `offre`) |

La ressource `postuler-juste://espace/AGENTS.md` donne les consignes générales seules ; les `instructions` du serveur renvoient vers elles.

Les erreurs (offre introuvable, note hors échelle, lien invalide…) reviennent à l'IA comme résultat d'erreur lisible ; le serveur continue.

## Claude Code

Fichier `.mcp.json` à la racine du dossier de données (ou du projet où l'on travaille) :

```json
{
  "mcpServers": {
    "postuler-juste": { "command": "postuler-juste", "args": ["mcp"] }
  }
}
```

Testé sous Windows 11 avec Claude Code 2.1.314 et la commande installée par `npm link` : les trois formes ci-dessous se connectent et exposent les outils (22 en version 0.4, 32 avec les outils d'espace, de fichiers et de CV).

| Forme | `command` / `args` | Quand l'utiliser |
|---|---|---|
| Commande seule | `"postuler-juste"`, `["mcp"]` | Claude Code (il retrouve le `postuler-juste.cmd` de `npm link`) |
| Via `cmd` | `"cmd"`, `["/c", "postuler-juste", "mcp"]` | Clients Windows qui lancent le programme sans shell |
| Node direct | `"node"`, `["C:/chemin/postuler-juste/bin/postuler-juste.js", "mcp"]` | Partout, sans `npm link` ; la forme la plus robuste |

Lancé sans shell (`child_process.spawn('postuler-juste')`), `postuler-juste` seul échoue sous Windows (`ENOENT` : npm crée un `.cmd`, pas un `.exe`) ; d'où les deux autres formes pour les clients génériques.

Pour imposer le dossier de données : ajouter `"--data", "D:/chemin/donnees"` aux `args`, ou `"env": { "POSTULER_JUSTE_DATA": "D:/chemin/donnees" }`.

En ligne de commande : `claude mcp add postuler-juste -- postuler-juste mcp` (portée locale), ou `claude mcp add --scope project …` pour écrire `.mcp.json`. Au premier lancement, Claude Code demande d'approuver un serveur déclaré dans `.mcp.json`.

## Claude Desktop

Claude Desktop n'a ni accès aux fichiers ni terminal : tout passe par le serveur, y compris la création de l'espace. Aucune commande à taper hormis l'installation de l'application.

**1. Déclarer le serveur** dans `claude_desktop_config.json` (Paramètres → Développeur → Modifier la configuration) :

- Windows : `%APPDATA%\Claude\claude_desktop_config.json` ;
- macOS : `~/Library/Application Support/Claude/claude_desktop_config.json`.

```json
{
  "mcpServers": {
    "postuler-juste": {
      "command": "node",
      "args": ["C:/chemin/postuler-juste/bin/postuler-juste.js", "mcp"],
      "env": { "POSTULER_JUSTE_DATA": "C:/Users/vous/ma-recherche" }
    }
  }
}
```

`command` : `node` doit être trouvé dans le `PATH` ; sinon, son chemin complet (`C:/Program Files/nodejs/node.exe`, `/usr/local/bin/node` ou `/opt/homebrew/bin/node` sur macOS). `args` : le chemin du `bin/postuler-juste.js` de l'application, avec des barres obliques. `env.POSTULER_JUSTE_DATA` : le dossier de votre espace de travail ; sans lui, le serveur prend `~/ma-recherche`. Le dossier courant de Claude Desktop n'est pas fiable : indiquez toujours le dossier par `env` (ou `"--data", "<dossier>"` dans `args`). Redémarrez Claude Desktop (quitter complètement, pas seulement fermer la fenêtre) après chaque modification.

**2. Démarrer** : dans une nouvelle conversation, bouton « + » → postuler-juste → prompt **`demarrage`**. Si l'espace n'existe pas encore, l'IA propose de le créer (`initialiser_espace`, dans le dossier configuré ou celui que vous choisissez), puis vous demande de déposer votre CV et l'export PDF de votre profil LinkedIn dans `a-deposer/` avec l'explorateur de fichiers. Si vous choisissez un autre dossier que celui de la configuration, reportez-le dans `POSTULER_JUSTE_DATA` : sinon la session suivante repartira du dossier configuré.

**3. Ensuite** : prompts `traiter-emails`, `preparer-go` et `cv-cible`, ou simplement vos demandes en clair (« traite les e-mails », « reprends le démarrage »). Les CV se génèrent par `generer_cv` ; l'IA voit le rendu (capture) et vous donne le chemin du PDF. C'est vous qui envoyez les candidatures.

Limites : l'IA ne lit pas LinkedIn, Indeed ni Glassdoor (pas de navigateur dans Claude Desktop sans extension) : collez le texte des offres quand elle le demande. Un PDF scanné, sans texte, ne se lit pas : glissez-le directement dans la conversation.

## Client générique

Tout client MCP stdio convient : lancer `node <chemin>/bin/postuler-juste.js mcp [--data <dossier>]` et échanger du JSON-RPC sur stdin / stdout (un message par ligne). stdout ne porte que le protocole ; les messages de l'application (« postuler-juste MCP prêt ») sortent sur stderr. Exemple avec le SDK TypeScript :

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'mon-client', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: 'node', args: ['C:/chemin/postuler-juste/bin/postuler-juste.js', 'mcp'] }));
const r = await client.callTool({ name: 'offres_a_lire', arguments: { limite: 10 } });
```

Inspecteur officiel, pour essayer les outils à la main : `npx @modelcontextprotocol/inspector node bin/postuler-juste.js mcp --data <dossier>`.

## Flux type

Voir [`AGENTS.md`](../AGENTS.md) : ingérer → lire → lire la grille (`grille`) → noter les critères (`noter_lot`) → candidater → enregistrer la candidature → tenir le journal (événements, échéances) → générer le suivi.
