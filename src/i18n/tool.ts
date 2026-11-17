// Translation mechanism shared by the CLI, the API, the generated tracker and the interface (no Node dependency here).
// One dictionary per language, of the same type: a key missing from the English translation is a compilation error.
// Texts carry "{name}" parameters; a plural text is an object { one, other } chosen from
// the "n" parameter (plural rules of the language: in French, 0 and 1 are singular).
//
// Adding a language: docs/ajouter-une-langue.md. Here, add it to LANGUAGES, LOCALES and NAMES_LANGUAGES; the compiler
// then reports each text to translate.

export const LANGUAGES = ['fr', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];
export const LANGUAGE_DEFAULT: Language = 'fr';

/** Locale used for dates and numbers (Intl): day before month in both languages. */
export const LOCALES: Record<Language, string> = { fr: 'fr-FR', en: 'en-GB' };

/** Name of each language in that language (interface selector; also accepted as a value of "language"). */
export const NAMES_LANGUAGES: Record<Language, string> = { fr: 'Français', en: 'English' };

/**
 * Plural text: `one` and `other` always; `zero`, `two`, `few`, `many` for the languages that distinguish them
 * (categories of Intl.PluralRules: Polish, Arabic…). A missing category falls back on `other`.
 */
export interface Plural {
  zero?: string;
  one: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}
export type MessageText = string | Plural;
export type Params = Record<string, string | number | null | undefined>;

export function isLanguage(x: unknown): x is Language {
  return typeof x === 'string' && (LANGUAGES as readonly string[]).includes(x);
}

const rules = new Map<Language, Intl.PluralRules>();
function rulesPlural(language: Language): Intl.PluralRules {
  let r = rules.get(language);
  if (!r) {
    r = new Intl.PluralRules(LOCALES[language]);
    rules.set(language, r);
  }
  return r;
}

/** Replaces the {name} parameters; a missing parameter leaves the marker visible (an oversight is easy to spot). */
export function translate(text: MessageText, language: Language, params: Params = {}): string {
  const raw = typeof text === 'string' ? text : (text[rulesPlural(language).select(Number(params.n ?? 0))] ?? text.other);
  return raw.replace(/\{(\w+)\}/g, (m, key: string) => {
    const v = params[key];
    return v === undefined || v === null ? m : String(v);
  });
}

/** Function t(key, params) on a set of dictionaries, for the language returned by `language()`. */
export function createTranslator<C extends string>(dictionaries: Record<Language, Record<C, MessageText>>, language: () => Language) {
  return (key: C, params?: Params): string => translate(dictionaries[language()][key], language(), params);
}

/** Number by language ("6,5" in French, "6.5" in English). */
export function numberLocal(n: number, language: Language, decimals = 2): string {
  return n.toLocaleString(LOCALES[language], { maximumFractionDigits: decimals });
}
