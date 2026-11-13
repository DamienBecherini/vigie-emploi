// Textes de la CLI, de l'API, du suivi généré et de l'initialisation.
// - t(clé, params) : dans la langue courante du processus (CLI : fixée au démarrage d'après la configuration) ;
// - tl(langue, clé, params) : dans une langue donnée (API, suivi : langue de la configuration passée en paramètre).
import { en } from './en.ts';
import { fr, type KeyServer } from './fr.ts';
import { LANGUAGE_DEFAULT, LOCALES, translate, type Language, type Params, type MessageText } from './tool.ts';

export type { KeyServer };
export { LANGUAGE_DEFAULT, LANGUAGES, LOCALES, isLanguage, type Language } from './tool.ts';

export const DICTIONARIES: Record<Language, Record<KeyServer, MessageText>> = { fr, en };

let current: Language = LANGUAGE_DEFAULT;

export function defineLanguage(language: Language): void {
  current = language;
}

export function languageCurrent(): Language {
  return current;
}

export function tl(language: Language, key: KeyServer, params?: Params): string {
  return translate(DICTIONARIES[language][key], language, params);
}

export function t(key: KeyServer, params?: Params): string {
  return tl(current, key, params);
}

/** Nombre avec le séparateur décimal de la langue (« 6,5 », « 6.5 »), sans séparateur de milliers, arrondi à `d` décimales. */
export function decimal(n: number, language: Language = current, d = 2): string {
  return n.toLocaleString(LOCALES[language], { maximumFractionDigits: d, useGrouping: false });
}

/** Date et heure de Paris au format de la langue (« 02/11/2026 », « 10:30 »). */
export function dateHour(at: Date, language: Language): { date: string; hour: string } {
  const locale = LOCALES[language];
  return {
    date: at.toLocaleDateString(locale, { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' }),
    hour: at.toLocaleTimeString(locale, { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }),
  };
}
