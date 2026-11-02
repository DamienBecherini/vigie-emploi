# Utiliser cap-emploi avec une IA (serveur MCP)

`cap-emploi mcp` lance un serveur [MCP](https://modelcontextprotocol.io) sur l'entrée / sortie standard (transport stdio). Une IA (Claude Code, Claude Desktop ou tout client MCP) y trouve les outils pour ingérer les alertes, lire, noter, candidater et générer le suivi, sans passer par la ligne de commande. Le serveur appelle le même noyau que la CLI et le tableau de bord ; il n'appelle lui-même aucun modèle d'IA.

Le dossier de données est résolu comme pour la CLI : `--data <dossier>`, sinon `CAP_EMPLOI_DATA`, sinon `cap-emploi.config.json` (dossier courant, dossier de données ou racine de l'application). Le serveur garde la base ouverte tant que le client tourne ; la CLI et le tableau de bord peuvent s'en servir en même temps (attente de 5 s sur un verrou).

## Outils

| Outil | Rôle |
|---|---|
| `lister_offres` | Liste paginée, mêmes filtres que `cap-emploi list` (statuts, note min / max, sans note, sources, tags, texte, dates, contrat, télétravail, candidatures, tri) |
| `lire_offre` | Détail complet : description, notes, historique des statuts, tags, candidature |
| `offres_a_lire` | Offres à traiter sans note, avec `lecture` = `description`, `navigateur` ou `humain` |
| `noter_offre` | Une note (par `id`, ou par `url` : l'offre est créée au besoin) |
| `noter_lot` | Plusieurs notes au format des lots, tout ou rien |
| `changer_statut` | Statut + commentaire (historisé) |
| `modifier_tags` | Ajout / retrait de tags |
| `modifier_lien` | Lien de l'offre (ou `null` pour l'effacer) |
| `candidater` | Passe en `go`, renvoie l'offre, le dossier de données, un dossier suggéré et les étapes |
| `enregistrer_candidature` | Dossier, CV, canal, date d'envoi, message, prochaine action ; avec une date d'envoi, l'offre passe en `envoyee` |
| `ingerer_emails` | Lit les `.eml` puis les supprime (sauf `garder: true`) |
| `generer_suivi` | Écrit `candidatures/_SUIVI.genere.md` (aperçu), ou `_SUIVI.md` avec `remplacer: true` |

Les erreurs (offre introuvable, note hors échelle, lien invalide…) reviennent à l'IA comme résultat d'erreur lisible ; le serveur continue.

## Claude Code

Fichier `.mcp.json` à la racine du dossier de données (ou du projet où l'on travaille) :

```json
{
  "mcpServers": {
    "cap-emploi": { "command": "cap-emploi", "args": ["mcp"] }
  }
}
```

Testé sous Windows 11 avec Claude Code 2.1.314 et la commande installée par `npm link` : les trois formes ci-dessous se connectent et exposent les 12 outils.

| Forme | `command` / `args` | Quand l'utiliser |
|---|---|---|
| Commande seule | `"cap-emploi"`, `["mcp"]` | Claude Code (il retrouve le `cap-emploi.cmd` de `npm link`) |
| Via `cmd` | `"cmd"`, `["/c", "cap-emploi", "mcp"]` | Clients Windows qui lancent le programme sans shell |
| Node direct | `"node"`, `["C:/chemin/cap-emploi/bin/cap-emploi.js", "mcp"]` | Partout, sans `npm link` ; la forme la plus robuste |

Lancé sans shell (`child_process.spawn('cap-emploi')`), `cap-emploi` seul échoue sous Windows (`ENOENT` : npm crée un `.cmd`, pas un `.exe`) ; d'où les deux autres formes pour les clients génériques.

Pour imposer le dossier de données : ajouter `"--data", "D:/chemin/donnees"` aux `args`, ou `"env": { "CAP_EMPLOI_DATA": "D:/chemin/donnees" }`.

En ligne de commande : `claude mcp add cap-emploi -- cap-emploi mcp` (portée locale), ou `claude mcp add --scope project …` pour écrire `.mcp.json`. Au premier lancement, Claude Code demande d'approuver un serveur déclaré dans `.mcp.json`.

## Claude Desktop

Fichier `claude_desktop_config.json` (Paramètres → Développeur → Modifier la configuration ; sous Windows `%APPDATA%\Claude\claude_desktop_config.json`) :

```json
{
  "mcpServers": {
    "cap-emploi": {
      "command": "node",
      "args": ["C:/chemin/cap-emploi/bin/cap-emploi.js", "mcp", "--data", "C:/chemin/donnees"]
    }
  }
}
```

Le `--data` explicite évite de dépendre du dossier courant de Claude Desktop. Redémarrer Claude Desktop après la modification.

## Client générique

Tout client MCP stdio convient : lancer `node <chemin>/bin/cap-emploi.js mcp [--data <dossier>]` et échanger du JSON-RPC sur stdin / stdout (un message par ligne). stdout ne porte que le protocole ; les messages de l'application (« cap-emploi MCP prêt ») sortent sur stderr. Exemple avec le SDK TypeScript :

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'mon-client', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: 'node', args: ['C:/chemin/cap-emploi/bin/cap-emploi.js', 'mcp'] }));
const r = await client.callTool({ name: 'offres_a_lire', arguments: { limite: 10 } });
```

Inspecteur officiel, pour essayer les outils à la main : `npx @modelcontextprotocol/inspector node bin/cap-emploi.js mcp --data <dossier>`.

## Flux type

Voir [`AGENTS.md`](../AGENTS.md) : ingérer → lire → noter → candidater → enregistrer la candidature → générer le suivi.
