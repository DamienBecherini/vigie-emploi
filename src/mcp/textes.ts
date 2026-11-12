// Textes du serveur MCP dans la langue du processus (fixée au démarrage d'après la configuration, puis à chaque
// changement d'espace) : instructions, descriptions des outils et de leurs paramètres, résultats et erreurs.
// Les textes du serveur, longs et propres à chaque outil, restent à côté de leur code, une version par langue :
// un objet sans l'une des langues est une erreur de compilation.
import { langueCourante, type Langue } from '../i18n/index.ts';

export type Bilingue = Record<Langue, string>;

/** Texte dans la langue courante. */
export function bi(x: Bilingue): string {
  return x[langueCourante()];
}
