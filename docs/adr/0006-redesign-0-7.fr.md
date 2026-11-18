# ADR 0006 — La refonte 0.7 : erreurs à code, schémas partagés, codes au lieu de phrases, adaptateurs de sites

[English](0006-redesign-0-7.md) · **Français**

Date : 18/11/2026 · Statut : accepté

## Contexte

La version 0.6.0 a été la première version publique. Une revue d'architecture faite juste après a trouvé les fondations saines (un cœur partagé par la ligne de commande, l'API et le serveur MCP ; des historiques plutôt que des champs écrasés ; des fonctions pures pour la note) et cinq faiblesses qui coûteraient plus cher à chaque nouvelle fonction :

1. **Des erreurs reconnues à leur texte.** L'API répondait 400 à tout, y compris à un défaut du programme, et un endroit choisissait 403 ou 404 en cherchant dans le texte du message.
2. **La même donnée décrite plusieurs fois.** Une note avait une forme dans la ligne de commande, une autre dans le serveur MCP et une troisième dans l'interface, qui recopiait à la main 25 types du serveur ; 11 avaient dérivé.
3. **Des phrases françaises dans les données et dans le cœur.** Les drapeaux d'une note étaient enregistrés sous forme de phrases françaises, donc un espace de travail anglais affichait du français ; les libellés des statuts vivaient dans le cœur.
4. **Des sites d'offres nommés partout dans le code.** Les motifs de liens étaient une suite de `if`, la lecture des e-mails testait `source === 'glassdoor'`, l'ingestion tenait sa propre liste des sites dont elle lit la page.
5. **Cinq fichiers de plus de 500 lignes**, chacun mêlant plusieurs sujets.

Il n'y avait ni lint ni mesure de couverture, et la documentation était en français d'abord, alors que l'application était publiée pour les deux langues.

## Décisions

1. **Une erreur attendue est une `AppError` avec un code** ([`src/core/errors.ts`](../../src/core/errors.ts)) : `invalid`, `not-found`, `forbidden`, `not-configured`, `file-not-found`, `language-unknown`. Le cœur la lève ; chaque façade traduit le code en sa propre réponse (statut HTTP, code de sortie, résultat d'erreur MCP). Tout le reste est un défaut : il montre sa pile et répond 500. Aucun code ne lit le texte d'un message. `ErrorConfig` et `MailError` en héritent.
2. **Un schéma Zod par donnée, et les types déduits de lui.** Une note est définie une seule fois (`schemaInputBatch(describe)`), et le serveur MCP passe ses descriptions à cette fabrique au lieu d'écrire un second schéma. Le corps de chaque requête de l'API, les événements et le fichier de configuration sont validés là où ils entrent. L'interface importe ses types depuis le serveur, par des imports de types seulement, pour que rien du serveur n'arrive dans le bundle.
3. **Ce qui est enregistré porte des codes et des valeurs ; les phrases s'écrivent à l'affichage.** Un drapeau est `{ code, params }` ; le libellé d'un statut, d'un type d'événement ou d'un niveau vient d'une table par langue ([`src/i18n/labels.ts`](../../src/i18n/labels.ts)). Les notes enregistrées avant la 0.7 gardent leur message français et se lisent toujours. Un test refuse une phrase française dans `src/` hors des dictionnaires.
4. **Un adaptateur par site d'offres** ([`src/sources/`](../../src/sources/)) : reconnaissance des liens, qui lit l'annonce, lecture de la page, particularités des e-mails. Un registre les liste et le reste du code interroge le registre. L'identifiant d'un site et la clé (site, identifiant sur le site) ne changent pas, donc aucune migration. Indeed et Glassdoor gardent le site national du lien reçu.
5. **Des fichiers découpés par domaine, sans changement de comportement** : commandes, routes, outils MCP, parties de la grille de notation, composants et hooks de l'interface. La suite de tests a servi de preuve : elle passait sans modification avant et après chaque découpage. Cible : aucun fichier source de plus de 500 lignes, dictionnaires mis à part.
6. **L'anglais d'abord dans le dépôt.** Un fichier sans suffixe est en anglais et le français porte `.fr` (`README.fr.md`, `docs/reference.fr.md`, `scaffold-fr/`). L'historique des versions est tenu en anglais seulement. Un espace de travail créé sans `--language` prend la langue du système ; un espace dont la configuration ne nomme aucune langue reste en français, comme avant.
7. **Outillage** : Biome pour le lint et la mise en forme, couverture de `src/` avec un plancher, `npm run check` pour tout ce que lance la CI, sous Linux, Windows et macOS.

## Options écartées

- **Des types résultat à la place des exceptions** pour les erreurs attendues. Plus propre en théorie, mais chaque fonction du cœur et ses trois appelants auraient changé de forme. Une classe d'erreur avec un code donne la même garantie (aucun texte n'est comparé) pour un dixième du changement.
- **Un paquet séparé de types partagés** entre le serveur et l'interface. L'interface compile déjà contre `src/` par des imports de types ; un paquet ajouterait une étape de construction sans rien apporter.
- **Traduire les phrases enregistrées dans une migration.** Les anciens drapeaux sont du texte libre ; les retransformer en codes reviendrait à deviner. Ils sont gardés et affichés tels quels.
- **Une classe par site avec de l'héritage.** Les sites n'ont en commun qu'une forme. Un objet qui respecte une interface suffit, et la lecture commune du `JobPosting` de schema.org est une fonction que les adaptateurs appellent.
- **`noUncheckedIndexedAccess`** dans le compilateur. 226 erreurs, presque toutes du bruit sur des résultats d'expressions régulières déjà testés juste au-dessus. Écarté ; `noUnusedLocals` et `noUnusedParameters` sont actifs.
- **Découper davantage** (`Settings.tsx` et `Detail.tsx`, dans l'interface, sont encore longs). Laissé pour leur prochaine modification : chacun traite un seul sujet, et un découpage fait pour le seul nombre de lignes l'éparpillerait.

## Conséquences

- Les réponses de l'API ont changé, en mieux et de façon visible : 404 pour ce qui n'existe pas et 500 pour un défaut (c'était 400 dans les deux cas), et un champ `code` dans chaque erreur. Un client qui testait le statut 400 pour une offre absente doit tester 404.
- Ajouter un site d'offres, c'est un fichier, une ligne dans le registre et un bloc de tests. Ajouter une langue ne touche plus le cœur pour les libellés.
- Les noms en français d'abord ont disparu du dépôt (`utiliser-avec-une-ia.md` est devenu `mcp.md`). Les liens publiés avant la 0.7 vers le README français doivent viser `README.fr.md`.
- Le prix de l'outillage : une CI plus lente (trois systèmes, couverture sous Linux) et un commit de mise en forme listé dans `.git-blame-ignore-revs`.
