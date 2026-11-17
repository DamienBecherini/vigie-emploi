// Texts of the CLI, the API, the generated tracker and the initialization.
// - t(key, params): in the current language of the process (CLI: set at startup from the configuration);
// - tl(language, key, params): in a given language (API, tracker: language of the configuration passed as a parameter).
import { en } from './en.ts';
import { fr, type KeyServer } from './fr.ts';
import { LANGUAGE_DEFAULT, LOCALES, translate, type Language, type Params, type MessageText } from './tool.ts';

export type { KeyServer };
export { LANGUAGE_DEFAULT, LANGUAGE_REFERENCE, LANGUAGES, LOCALES, isLanguage, type Language } from './tool.ts';

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

/** Number with the language's decimal separator ("6,5", "6.5"), without thousands separator, rounded to `d` decimals. */
export function decimal(n: number, language: Language = current, d = 2): string {
  return n.toLocaleString(LOCALES[language], { maximumFractionDigits: d, useGrouping: false });
}

/** Paris date and time in the language's format ("02/11/2026", "10:30"). */
export function dateHour(at: Date, language: Language): { date: string; hour: string } {
  const locale = LOCALES[language];
  return {
    date: at.toLocaleDateString(locale, { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' }),
    hour: at.toLocaleTimeString(locale, { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }),
  };
}
