# ADR 0001 — Choix techniques du sprint 1

Date : 02/11/2026 · Statut : accepté

## Contexte

Remplacer un flux Markdown + script Python (tri des e-mails d'alertes, registre des offres écartées, suivi des candidatures) par une application locale qui devienne la source de vérité des offres, notes, statuts et tags. Contraintes : Windows d'abord, pilotable par une IA, données personnelles hors du dépôt, ouverture possible plus tard (serveur MCP, Electron, publication).

## Décisions

1. **TypeScript sur Node 24, sans étape de compilation pour le serveur.** Node 24 exécute le TypeScript en retirant les types : `bin/vigie-emploi.js` importe directement `src/cli/main.ts`. Le code s'en tient à la syntaxe effaçable (`erasableSyntaxOnly`) et aux imports en `.ts`. `npm run build` vérifie les types et compile seulement l'interface. Conséquence : un paquet installé depuis `node_modules` (npm public, Electron) demandera une étape de compilation, à ajouter le moment venu (`tsc` avec `rewriteRelativeImportExtensions`).
2. **SQLite via `node:sqlite`.** Intégré à Node, rien à compiler sous Windows ; FTS5 disponible (vérifié, SQLite 3.50). Le module est marqué expérimental : l'avertissement est masqué dans le point d'entrée. Repli prévu : `better-sqlite3`, API très proche.
3. **Migrations SQL versionnées, sans ORM.** Fichiers `migrations/NNNN_nom.sql`, numéro dans `PRAGMA user_version`, chaque migration dans une transaction. Les requêtes sont écrites à la main dans `src/core`.
4. **Journal par défaut (pas de WAL).** La base est destinée à être versionnée dans le dossier de données : un seul fichier, complet après chaque écriture. `busy_timeout` à 5 s pour que la CLI et le serveur cohabitent.
5. **Historique + colonnes dénormalisées.** `notes` et `statuts` gardent tout l'historique (la dernière ligne fait foi) ; `offres.note` et `offres.statut` en reprennent la valeur courante pour trier et filtrer avec index. Elles sont recalculées à chaque ajout.
6. **Dédoublonnage par `(source, id_site)`** : identifiant LinkedIn, `jk` Indeed, `jobListingId` Glassdoor, numéro Hellowork, dernier segment de l'URL Free-Work. Les offres sans lien venues du registre ont la source `registre` et une empreinte du contenu ; celles du suivi, la source `suivi` et le nom du dossier.
7. **Recherche plein texte FTS5** (tokeniseur `unicode61 remove_diacritics 2`) en table de contenu externe, tenue à jour par déclencheurs. Les mots saisis sont mis entre guillemets avec recherche par préfixe : pas d'injection de syntaxe FTS.
8. **Hono + @hono/node-server** pour l'API et le service de l'interface compilée (léger, testable sans réseau avec `app.request`). Écoute sur 127.0.0.1 seulement, port 4410.
9. **Interface React 19 + Vite + Tailwind CSS v4 + TanStack Table (v8) / Query.** Pagination, tri et filtres côté serveur ; filtres dans l'URL ; préférences (thème, zoom, colonnes) dans `localStorage`. ShadCN/UI non retenu : quelques composants maison suffisent.
10. **Lecture MIME par `postal-mime`** (quoted-printable, base64, jeux de caractères, multipart) et décodage des entités HTML par `entities`, plutôt qu'un analyseur maison.
11. **Configuration hors du code.** `vigie-emploi.config.json` (ignoré par git) ou `VIGIE_EMPLOI_DATA`. Les listes d'exclusion d'intitulés et d'employeurs sont dans la configuration de l'utilisateur, pas dans le code.
12. **Pas d'appel à un modèle d'IA, pas de téléchargement LinkedIn / Indeed / Glassdoor.** Seuls Hellowork et Free-Work sont lus (JSON-LD public), désactivable (`--no-fetch`, `telechargerJsonLd: false`).

## Reprise de l'historique : heuristiques retenues

- Lots JSON : chaque entrée devient une note (`origine = import-lot`, date du nom de fichier) et l'offre passe en `notee`.
- Registre : chaque lien d'offre d'une ligne devient une offre `ecartee` (ou `abandonnee` quand la raison commence par « GO »), avec la date, la note et la raison. Lignes groupées : intitulés séparés par « · », entreprises et notes réparties par position quand leur nombre correspond ; notes ambiguës (« 4 à 7 », « ≤ 2,5 ») non reprises. Section « Mises de côté » : tag `a-reprendre`.
- Suivi : le lien d'offre est cherché dans le dossier de candidature ; le statut est déduit des colonnes (« À envoyer » → `go`, date d'envoi → `envoyee`, relance, entretien ; section Closes : refus, abandon ou clôture).
- Idempotence : une ligne de statut identique (statut, commentaire, origine) ou une note identique (origine, date, valeur) n'est pas ajoutée deux fois.
