# Contribuer à vigie-emploi

[English](CONTRIBUTING.md) · **Français**

Merci de regarder le code. Cette page dit comment s'installer, ce qui doit accompagner une modification, et où ranger les choses. [`docs/code.fr.md`](docs/code.fr.md) explique comment le code s'articule ; à lire en premier.

## S'installer

Il faut Node 24 ou plus récent et git. Chrome ou Edge ne sert qu'à produire un CV en PDF.

```sh
git clone https://github.com/DamienBecherini/vigie-emploi.git
cd vigie-emploi
npm ci
npm run check        # typecheck, lint, build, tests : ce que lance la CI
```

Node exécute directement le TypeScript de `src/` : rien à construire pour essayer une modification en ligne de commande.

```sh
node bin/vigie-emploi.js init ../mon-espace-de-test --language fr
node bin/vigie-emploi.js list --data ../mon-espace-de-test
```

Le tableau de bord a besoin de son interface compilée une fois (`npm run build`), puis `node bin/vigie-emploi.js serve --data ../mon-espace-de-test`. Pendant un travail sur l'interface, `npm run dev:ui` la sert avec rechargement à chaud sur le port 5173 et envoie ses appels d'API à ce serveur (port 4410, ou l'adresse donnée dans `VIGIE_EMPLOI_API`).

Un espace de démonstration avec des offres fictives : `node scripts/demo/demo.ts ../demo-fr fr`.

## Ce qui accompagne une modification

- **Un test.** Une correction vient avec un test qui échoue sans elle ; une fonction, avec les tests de ce qu'elle fait et de ce qu'elle refuse. Les tests n'utilisent que des données fictives (`tests/fixtures/`) : aucun vrai nom, e-mail, entreprise ni offre.
- **`npm run check` passe.** `npm run format` réécrit la mise en forme ; `npm run coverage` doit rester au-dessus du plancher fixé dans `vitest.config.ts`.
- **Une ligne dans [`CHANGELOG.md`](CHANGELOG.md)** (tenu en anglais) quand un utilisateur peut voir le changement, écrite pour lui : ce qu'il peut faire désormais, ou ce qui ne se passe plus mal.
- **La documentation qui le décrit**, en anglais et en français : chaque document existe dans les deux versions (`x.md` et `x.fr.md`), et un test vérifie que chacune existe et qu'aucun lien relatif n'est cassé.

## Règles du code

- **Une syntaxe que Node sait effacer.** Pas d'`enum`, pas de propriétés déclarées dans les paramètres d'un constructeur, pas de namespaces ; les imports nomment le fichier avec son extension `.ts`. Le compilateur l'impose (`erasableSyntaxOnly`).
- **Une règle du métier va dans `src/core/`**, et la commande, la route et l'outil MCP l'appellent. Si vous écrivez la même condition dans deux d'entre eux, sa place est dans le cœur.
- **Une erreur que l'utilisateur peut provoquer est une `AppError` avec un code** (`src/core/errors.ts`). Ne jamais comparer le texte d'un message.
- **Ce qui vient de l'extérieur passe par un schéma Zod** là où il entre, et son type est déduit du schéma.
- **Aucune phrase dans les données ni dans le cœur.** Enregistrer un identifiant ou un code avec ses valeurs ; écrire la phrase à l'affichage, depuis les dictionnaires (`src/i18n/`, `src/mcp/i18n/`, `ui/src/i18n/`). Un nouveau texte demande sa clé dans chaque langue : le compilateur signale celle qui manque.
- **Les identifiants sont en anglais et stables** : commandes, options, outils, statuts, champs JSON, `source` d'un site d'offres. En renommer un casse les espaces de travail et les scripts des utilisateurs.
- **Aucune donnée personnelle dans le dépôt.** Tout ce qui concerne un utilisateur vit dans son espace de travail.
- **Les commentaires disent ce que le code ne peut pas dire** : le pourquoi, la contrainte, le piège. En anglais.

## Ajouts courants

- **Un site d'offres** : un adaptateur dans `src/sources/`. Voir [Sites d'offres](docs/code.fr.md#sites-doffres). Ne pas ajouter le téléchargement d'une page que les conditions d'utilisation du site interdisent.
- **Une langue** : [`docs/adding-a-language.fr.md`](docs/adding-a-language.fr.md).
- **Une commande, une route ou un outil** : écrire l'opération dans `src/core/` avec ses tests, puis l'exposer. Une commande va dans le fichier correspondant de `src/cli/commands/` et dans le texte d'aide ; une route dans `src/api/routes/`, avec le schéma de son corps dans `src/api/bodies.ts` ; un outil dans `src/mcp/tools/`, avec ses descriptions dans `src/mcp/i18n/en.ts`.
- **Un changement de la base** : un nouveau fichier numéroté dans `migrations/`. Ne jamais modifier une migration publiée : les bases des utilisateurs l'ont déjà appliquée.

## Proposer une modification

Ouvrir d'abord une issue pour tout ce qui dépasse une correction, afin de s'accorder sur la direction avant le travail. Puis une pull request sur GitHub, un sujet par pull request, avec ce qu'elle change pour l'utilisateur et la façon dont vous l'avez testée.

Le dépôt GitHub est un miroir du serveur git du mainteneur : une pull request acceptée y est appliquée et arrive sur GitHub par le miroir ; elle peut donc être fermée à la main plutôt que par le bouton de fusion. Vos commits gardent votre nom.

Un problème de sécurité ne se signale pas dans une issue publique : voir [`SECURITY.md`](.github/SECURITY.md).

## Publier une version (mainteneur)

1. Ajouter la section de la version en tête de `CHANGELOG.md`, puis `npm version <x.y.z> --no-git-tag-version` (`package.json` et `package-lock.json` ; le manifeste de l'extension prend sa version dans `package.json`).
2. `npm run check`, commit « Version x.y.z », tag `vx.y.z`, pousser la branche et le tag sur le serveur du mainteneur (le miroir les porte sur GitHub).
3. `npm run mcpb`, puis `gh release create vx.y.z build/vigie-emploi-x.y.z.mcpb --latest` avec les notes d'installation de la release précédente et le changelog de la version.
4. `npm publish` dans un terminal interactif : le compte npm utilise l'authentification web (`auth-type=web`), qui ouvre le navigateur pour confirmer. Lancé sans terminal (le shell d'un agent), npm se rabat sur un code à usage unique et s'arrête sur `EOTP` : le mainteneur lance alors la commande lui-même.
