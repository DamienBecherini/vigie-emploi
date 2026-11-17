# Ajouter une langue

**Français** · [English](adding-a-language.md)

vigie-emploi est livré en français (langue par défaut) et en anglais. Une langue de plus ne demande aucun changement de logique : on la déclare, puis on traduit ce que le compilateur et les tests signalent. Exemple avec l'espagnol (`es`).

## 1. Déclarer la langue

Dans `src/i18n/tool.ts` :

```ts
export const LANGUAGES = ['fr', 'en', 'es'] as const;
export const LOCALES: Record<Language, string> = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES' };
export const NAMES_LANGUAGES: Record<Language, string> = { fr: 'Français', en: 'English', es: 'Español' };
```

La locale règle les dates, les nombres et les pluriels (`Intl`). Le nom apparaît dans le sélecteur de l'interface et est accepté comme valeur de `language` (« Español », « espanol », « es »).

## 2. Traduire ce que le compilateur signale

`npm run typecheck` liste chaque endroit où la nouvelle langue manque :

| Fichier | Contenu |
|---|---|
| `src/i18n/es.ts` (copie de `en.ts`), à ajouter dans `DICTIONARIES` de `src/i18n/index.ts` | CLI, API, suivi généré, initialisation |
| `ui/src/i18n/es.ts`, à ajouter dans `DICTIONARIES_UI` de `ui/src/i18n/index.ts` | Tableau de bord |
| `src/mcp/i18n/es.ts`, à ajouter dans `DICTIONARIES_MCP_USER` de `src/mcp/texts.ts` | Textes du serveur MCP montrés tels quels à l'utilisateur (titres des outils et des prompts, descriptions des prompts, phrases `to_tell`) ; le reste (instructions, descriptions des outils, paramètres, résultats et erreurs, lus par l'IA seule) reste en anglais |
| `src/i18n/labels.ts` | Libellés des statuts, types d'événement, niveaux d'inventaire |
| `ui/src/theme.ts` | Noms des couleurs (`LABELS_NEUTRAL`, `LABELS_ACCENTS`) |

Soit trois dictionnaires (environ un millier de textes en tout, à partir des fichiers anglais) et cinq petites tables. Le compilateur ne signale rien d'autre : le reste du code ne connaît aucune langue en particulier.

Les textes gardent leurs paramètres `{nom}`. Un texte au pluriel est un objet `{ one, other }`, complété au besoin par `zero`, `two`, `few` ou `many` pour les langues qui les distinguent (catégories de `Intl.PluralRules`).

## 3. Fichiers traduits

| Fichier | Rôle | Sans traduction |
|---|---|---|
| `scaffold-es/` (copie de `scaffold-en/`) | Espace de travail créé par `init --language es` : consignes de l'IA, démarrage, exemple de CV | Le modèle français est copié, avec un avertissement |
| `AGENTS.es.md` | Consignes de l'application pour l'agent | `AGENTS.md` (français) |
| `examples/rubric.es.json` | Grille d'exemple | Grille française |
| `README.es.md` | Présentation, à relier au sélecteur de langue en tête des README | — |
| `docs/*.es.md` | Guides (utiliser avec une IA, ajouter une langue), à relier à leur sélecteur de langue | Guides français |

`npm test` (fichier `tests/languages.test.ts`) vérifie que ces fichiers existent, que `scaffold-es/` contient les mêmes fichiers que `scaffold/`, et qu'aucun texte des dictionnaires n'est vide ou resté en français.

## 4. Facultatif

- Titres de section usuels d'un CV dans la langue (`SECTIONS_BY_LANGUAGE`, `src/cv/cv.ts`) : l'attribut `lang` du CV est alors détecté tout seul.
- Descriptions des gabarits de CV (`DESCRIPTIONS_TEMPLATES`, même fichier) et noms des palettes (`translations` dans `ui/src/theme.ts`) : à défaut, le français.
- Champ « Langue » de l'extension Claude Desktop (`mcpb/manifest.json`) : citer la nouvelle valeur dans la description.

## 5. Vérifier

```bash
npm run typecheck && npm test && npm run build
node bin/vigie-emploi.js init /tmp/essai-es --language es
```

Puis ouvrir le tableau de bord (`node bin/vigie-emploi.js serve --data /tmp/essai-es`) et choisir la langue dans l'en-tête. Faire relire les textes par une personne dont c'est la langue.

Les identifiants (statuts `new`, `sent`…, noms de commandes, en anglais) et les noms de fichiers de l'espace (en français) sont les mêmes dans toutes les langues : l'IA et les scripts s'appuient dessus.
