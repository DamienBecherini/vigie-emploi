// Textes du serveur MCP dans la langue du processus (fixée au démarrage d'après la configuration, puis à chaque
// changement d'espace) : instructions, descriptions des outils et de leurs paramètres, résultats et erreurs.
// Les textes vivent dans les dictionnaires src/mcp/i18n/<langue>.ts, comme ceux de la CLI et de l'interface :
// une langue de plus ne demande qu'un fichier de traduction (docs/ajouter-une-langue.md).
import { langueCourante, LANGUES, type Langue } from '../i18n/index.ts';
import { traduire, type Params, type Texte } from '../i18n/outil.ts';
import { en } from './i18n/en.ts';
import { fr, type CleMcp } from './i18n/fr.ts';

export type { CleMcp };
export type Bilingue = Record<Langue, string>;

export const DICTIONNAIRES_MCP: Record<Langue, Record<CleMcp, Texte>> = { fr, en };

/** Texte dans la langue courante. */
export function tm(cle: CleMcp, params?: Params): string {
  return traduire(DICTIONNAIRES_MCP[langueCourante()][cle], langueCourante(), params);
}

/** Texte dans toutes les langues (objet attendu par les fonctions qui choisissent la langue elles-mêmes). */
export function bt(cle: CleMcp, params?: Params): Bilingue {
  return Object.fromEntries(LANGUES.map((l) => [l, traduire(DICTIONNAIRES_MCP[l][cle], l, params)])) as Bilingue;
}

/** Texte déjà décliné par langue, dans la langue courante. */
export function bi(x: Bilingue): string {
  return x[langueCourante()];
}
