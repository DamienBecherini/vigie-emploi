// Textes de la CLI, de l'API, du suivi généré et de l'initialisation.
// - t(clé, params) : dans la langue courante du processus (CLI : fixée au démarrage d'après la configuration) ;
// - tl(langue, clé, params) : dans une langue donnée (API, suivi : langue de la configuration passée en paramètre).
import { en } from './en.ts';
import { fr, type CleServeur } from './fr.ts';
import { LANGUE_DEFAUT, LOCALES, traduire, type Langue, type Params, type Texte } from './outil.ts';

export type { CleServeur };
export { LANGUE_DEFAUT, LANGUES, LOCALES, estLangue, type Langue } from './outil.ts';

export const DICTIONNAIRES: Record<Langue, Record<CleServeur, Texte>> = { fr, en };

let courante: Langue = LANGUE_DEFAUT;

export function definirLangue(langue: Langue): void {
  courante = langue;
}

export function langueCourante(): Langue {
  return courante;
}

export function tl(langue: Langue, cle: CleServeur, params?: Params): string {
  return traduire(DICTIONNAIRES[langue][cle], langue, params);
}

export function t(cle: CleServeur, params?: Params): string {
  return tl(courante, cle, params);
}

/** Nombre avec le séparateur décimal de la langue (« 6,5 », « 6.5 »), sans séparateur de milliers, arrondi à `d` décimales. */
export function decimal(n: number, langue: Langue = courante, d = 2): string {
  return n.toLocaleString(LOCALES[langue], { maximumFractionDigits: d, useGrouping: false });
}

/** Date et heure de Paris au format de la langue (« 02/11/2026 », « 10:30 »). */
export function dateHeure(le: Date, langue: Langue): { date: string; heure: string } {
  const locale = LOCALES[langue];
  return {
    date: le.toLocaleDateString(locale, { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' }),
    heure: le.toLocaleTimeString(locale, { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }),
  };
}
