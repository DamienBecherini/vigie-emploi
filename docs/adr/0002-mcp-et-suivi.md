# ADR 0002 — Serveur MCP, édition dans l'interface et suivi généré

Date : 02/11/2026 · Statut : accepté

## Contexte

Sprint 2 : brancher postuler-juste sur une IA sans passer par la CLI, éditer notes et candidatures depuis le tableau de bord, et faire de la base la source du suivi des candidatures (`_SUIVI.md`), tenu à la main jusqu'ici. Reprendre aussi deux défauts de la reprise du sprint 1 (lignes groupées du registre, doublons suivi / registre).

## Décisions

1. **Serveur MCP officiel, transport stdio** (`@modelcontextprotocol/sdk` 1.32, `McpServer.registerTool`, schémas Zod 4). Commande `postuler-juste mcp`, chargée à la demande (le SDK n'est pas importé par les autres commandes). Douze outils aux noms et descriptions en français : c'est ce que lit l'IA. Pas de transport HTTP : usage local, un client à la fois ; le tableau de bord reste l'interface HTTP.
2. **Pas de logique dans la couche MCP.** Les opérations partagées sont sorties de la CLI vers `src/core/actions.ts` (`offresALire`, `noterOffres`, `preparerCandidature`, `suivreCandidature`) et appelées par la CLI, l'API et le MCP. Chaque appel enregistre son origine (`cli`, `interface`, `mcp`) dans l'historique.
3. **Erreurs MCP en résultat** (`isError: true`, message en français) plutôt qu'en exception de protocole : l'IA lit la cause et corrige son appel ; le serveur continue. stdout est réservé au protocole, tout le reste va sur stderr.
4. **Windows : trois formes de lancement documentées.** Vérifié sous Windows 11 avec Claude Code 2.1.314 : `postuler-juste mcp` (binaire `npm link`), `cmd /c postuler-juste mcp` et `node <chemin>/bin/postuler-juste.js mcp` se connectent tous. Un `spawn` sans shell échoue sur `postuler-juste` (`ENOENT`, npm crée un `.cmd`) : les clients génériques prennent la forme `node` ou `cmd /c`.
5. **Migration 0002** : la table `candidatures` gagne `prochaine_action` (+ `prochaine_action_origine`), `libelle` (cellule Offre du suivi, en Markdown), `conditions` (cellule Type), `etat` (cellule Statut ou Issue reprise) et `maj_le`. Ces colonnes portent ce que la reprise perdait et que le suivi généré doit restituer.
6. **Mise à jour d'une candidature** : champ absent = inchangé, `null` ou `''` = effacé (le sprint 1 ne savait pas effacer). Une date d'envoi fait passer une offre pas encore envoyée en `envoyee` ; « JJ/MM/AAAA » est rangé en ISO, un texte libre (« ≈ 25/08/2026 », « après le 20/08/2026 ») est gardé tel quel.
7. **Prochaine action : la saisie gagne sur la reprise.** `import-historique` ne remplace la prochaine action que si elle vient elle-même de la reprise (`prochaine_action_origine` vide ou `import-suivi`).
8. **Suivi généré, aperçu d'abord.** `generer-suivi` écrit `candidatures/_SUIVI.genere.md` ; `--remplacer` écrit `_SUIVI.md`. En tête, « Fichier généré par postuler-juste … ne pas éditer à la main » ; `import-historique` reconnaît cette marque et ne relit pas un suivi généré (sinon il réinterpréterait ses propres textes de statut).
9. **Règles du suivi généré.**
   - Lignes : offres en `go` et suivants, et toute offre qui a une candidature.
   - Statut retenu : le dernier statut hors reprise du registre et des lots (une offre revue dans un lot d'alertes ne change pas l'état d'une candidature).
   - Texte de la colonne Statut / Issue : la cellule reprise (`etat`) tant que le dernier statut est celui de la reprise ; ensuite le commentaire du dernier statut, ou à défaut son libellé et la note.
   - Sections : En cours ; Envoyées sans suite (envoyée ou relancée, état « sans nouvelles » ou « sans réponse ») ; Closes (refus, close, abandonnée, écartée).
   - Tri : à envoyer d'abord puis du dernier envoi au plus ancien ; closes de la plus récente à la plus ancienne (date écrite dans l'issue), sans date à la fin.
   - Liens relatifs à `candidatures/`, vers `dossier-candidature.md` s'il existe, sinon vers le dossier.
10. **Registre : lignes groupées.** Entreprises séparées par « · », « / » ou, à défaut, une par bloc en gras ; « (×3) » compte trois offres. Répartition par segment d'intitulé quand les nombres concordent (sprint 1), sinon **par lien d'offre, dans l'ordre**, quand le nombre d'entreprises (multiplicités comprises) égale le nombre de liens ; sinon la cellule entière. Une reprise corrige les offres existantes dont l'entreprise était la cellule entière.
11. **Doublons suivi / registre sans lien.** Une ligne du suivi sans lien d'offre est rattachée à l'offre `registre` de la même entreprise (comparaison sans casse ni accents) dont l'intitulé partage un mot d'au moins 4 lettres, si elle est unique. Un doublon créé par une reprise précédente y est fusionné (`fusionnerOffres` : notes, statuts, tags et candidature déplacés, champs vides complétés, doublon supprimé). L'offre gardée est celle du registre, retrouvée à chaque reprise par sa clé : l'import reste idempotent.

## Conséquences

- Les ordres de lignes du suivi généré suivent une règle et non plus l'ordre manuel ; l'ancienne section « Anciennes, sans réponse connue » est fondue dans « Envoyées sans suite », avec toutes les colonnes.
- La répartition par lien est positionnelle : juste si l'ordre des entreprises suit celui des liens, ce qui est la convention du registre.
- Le SDK MCP tire Express et quelques dépendances ; elles ne sont chargées que par `postuler-juste mcp`.
