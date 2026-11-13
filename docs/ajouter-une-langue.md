# Ajouter une langue

vigie-emploi est livré en français (langue par défaut) et en anglais. Une langue de plus ne demande aucun changement de logique : on la déclare, puis on traduit ce que le compilateur et les tests signalent. Exemple avec l'espagnol (`es`).

## 1. Déclarer la langue

Dans `src/i18n/outil.ts` :

```ts
export const LANGUES = ['fr', 'en', 'es'] as const;
export const LOCALES: Record<Langue, string> = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES' };
export const NOMS_LANGUES: Record<Langue, string> = { fr: 'Français', en: 'English', es: 'Español' };
```

La locale règle les dates, les nombres et les pluriels (`Intl`). Le nom apparaît dans le sélecteur de l'interface et est accepté comme valeur de `langue` (« Español », « espanol », « es »).

## 2. Traduire ce que le compilateur signale

`npm run typecheck` liste chaque endroit où la nouvelle langue manque :

| Fichier | Contenu |
|---|---|
| `src/i18n/es.ts` (copie de `en.ts`), à ajouter dans `DICTIONNAIRES` de `src/i18n/index.ts` | CLI, API, suivi généré, initialisation |
| `ui/src/i18n/es.ts`, à ajouter dans `DICTIONNAIRES_UI` de `ui/src/i18n/index.ts` | Tableau de bord |
| `src/i18n/libelles.ts` | Libellés des statuts, types d'événement, niveaux d'inventaire |
| `ui/src/theme.ts` | Noms des couleurs (`LIBELLES_NEUTRES`, `LIBELLES_ACCENTS`) |
| `src/mcp/*.ts` (textes `{ fr: …, en: … }`) | Instructions, outils, paramètres et messages du serveur MCP |

Les textes gardent leurs paramètres `{nom}`. Un texte au pluriel est un objet `{ one, other }`, complété au besoin par `zero`, `two`, `few` ou `many` pour les langues qui les distinguent (catégories de `Intl.PluralRules`).

## 3. Fichiers traduits

| Fichier | Rôle | Sans traduction |
|---|---|---|
| `modele-es/` (copie de `modele-en/`) | Espace de travail créé par `init --langue es` : consignes de l'IA, démarrage, exemple de CV | Le modèle français est copié, avec un avertissement |
| `AGENTS.es.md` | Consignes de l'application pour l'agent | `AGENTS.md` (français) |
| `exemples/grille.es.json` | Grille d'exemple | Grille française |
| `README.es.md` | Présentation, à relier au sélecteur de langue en tête des README | — |

`npm test` (fichier `tests/langues.test.ts`) vérifie que ces fichiers existent, que `modele-es/` contient les mêmes fichiers que `modele/`, et qu'aucun texte des dictionnaires n'est vide ou resté en français.

## 4. Facultatif

- Titres de section usuels d'un CV dans la langue (`SECTIONS_PAR_LANGUE`, `src/cv/cv.ts`) : l'attribut `lang` du CV est alors détecté tout seul.
- Descriptions des gabarits de CV (`DESCRIPTIONS_GABARITS`, même fichier) et noms des palettes (`traductions` dans `ui/src/theme.ts`) : à défaut, le français.
- Champ « Langue » de l'extension Claude Desktop (`mcpb/manifest.json`) : citer la nouvelle valeur dans la description.

## 5. Vérifier

```bash
npm run typecheck && npm test && npm run build
node bin/vigie-emploi.js init /tmp/essai-es --langue es
```

Puis ouvrir le tableau de bord (`node bin/vigie-emploi.js serve --data /tmp/essai-es`) et choisir la langue dans l'en-tête. Faire relire les textes par une personne dont c'est la langue.

Les identifiants (statuts `nouvelle`, `envoyee`…, noms de commandes, noms de fichiers de l'espace) restent en français dans toutes les langues : l'IA et les scripts s'appuient dessus.
