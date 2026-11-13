// Textes du serveur MCP dans la langue du processus (fixée au démarrage d'après la configuration, puis à chaque
// changement d'espace) : instructions, descriptions des outils et de leurs paramètres, résultats et erreurs.
// Les textes vivent dans les dictionnaires src/mcp/i18n/<langue>.ts, comme ceux de la CLI et de l'interface :
// une langue de plus ne demande qu'un fichier de traduction (docs/ajouter-une-langue.md).
import { languageCurrent, LANGUAGES, type Language } from '../i18n/index.ts';
import { translate, type Params, type MessageText } from '../i18n/tool.ts';
import { en } from './i18n/en.ts';
import { fr, type KeyMcp } from './i18n/fr.ts';

export type { KeyMcp };
export type Bilingual = Record<Language, string>;

export const DICTIONARIES_MCP: Record<Language, Record<KeyMcp, MessageText>> = { fr, en };

/** Texte dans la langue courante. */
export function tm(key: KeyMcp, params?: Params): string {
  return translate(DICTIONARIES_MCP[languageCurrent()][key], languageCurrent(), params);
}

/** Texte dans toutes les langues (objet attendu par les fonctions qui choisissent la langue elles-mêmes). */
export function bt(key: KeyMcp, params?: Params): Bilingual {
  return Object.fromEntries(LANGUAGES.map((l) => [l, translate(DICTIONARIES_MCP[l][key], l, params)])) as Bilingual;
}

/** Texte déjà décliné par langue, dans la langue courante. */
export function bi(x: Bilingual): string {
  return x[languageCurrent()];
}
