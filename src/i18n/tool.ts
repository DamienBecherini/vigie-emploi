// Mécanisme de traduction partagé par la CLI, l'API, le suivi généré et l'interface (aucune dépendance Node ici).
// Un dictionnaire par langue, de même type : une clé absente de la traduction anglaise est une erreur de compilation.
// Les textes portent des paramètres « {nom} » ; un texte au pluriel est un objet { one, other } choisi d'après
// le paramètre « n » (règles de pluriel de la langue : en français, 0 et 1 sont au singulier).
//
// Ajouter une langue : docs/ajouter-une-langue.md. Ici, l'ajouter à LANGUES, LOCALES et NOMS_LANGUES ; le compilateur
// signale ensuite chaque texte à traduire.

export const LANGUAGES = ['fr', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];
export const LANGUAGE_DEFAULT: Language = 'fr';

/** Locale utilisée pour les dates et les nombres (Intl) : jour avant le mois dans les deux langues. */
export const LOCALES: Record<Language, string> = { fr: 'fr-FR', en: 'en-GB' };

/** Nom de chaque langue dans cette langue (sélecteur de l'interface ; aussi accepté comme valeur de « langue »). */
export const NAMES_LANGUAGES: Record<Language, string> = { fr: 'Français', en: 'English' };

/**
 * Texte au pluriel : `one` et `other` toujours ; `zero`, `two`, `few`, `many` pour les langues qui les distinguent
 * (catégories de Intl.PluralRules : polonais, arabe…). Une catégorie absente retombe sur `other`.
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

/** Remplace les paramètres {nom} ; un paramètre absent laisse le marqueur visible (oubli repérable). */
export function translate(text: MessageText, language: Language, params: Params = {}): string {
  const raw = typeof text === 'string' ? text : (text[rulesPlural(language).select(Number(params.n ?? 0))] ?? text.other);
  return raw.replace(/\{(\w+)\}/g, (m, key: string) => {
    const v = params[key];
    return v === undefined || v === null ? m : String(v);
  });
}

/** Fonction t(clé, params) sur un jeu de dictionnaires, pour la langue renvoyée par `langue()`. */
export function createTranslator<C extends string>(dictionaries: Record<Language, Record<C, MessageText>>, language: () => Language) {
  return (key: C, params?: Params): string => translate(dictionaries[language()][key], language(), params);
}

/** Nombre selon la langue (« 6,5 » en français, « 6.5 » en anglais). */
export function numberLocal(n: number, language: Language, decimals = 2): string {
  return n.toLocaleString(LOCALES[language], { maximumFractionDigits: decimals });
}
