// Texts of the MCP server. What only the AI reads (instructions, tool descriptions, parameters, results, errors,
// prompt framing) is in English, like the rest of the API: tm(). What is shown to the user verbatim (tool and prompt
// titles, prompt descriptions, to_tell sentences) follows the user's language (configuration "language" or
// VIGIE_EMPLOI_LANGUAGE): tu(), bt(). Texts live in src/mcp/i18n/<language>.ts (docs/adding-a-language.md).
import { languageCurrent, LANGUAGES, type Language } from '../i18n/index.ts';
import { translate, type Params, type MessageText } from '../i18n/tool.ts';
import { en, type KeyMcp, type KeyMcpUser } from './i18n/en.ts';
import { fr } from './i18n/fr.ts';

export type { KeyMcp, KeyMcpUser };
export type Bilingual = Record<Language, string>;

/** Texts shown to the user, per language. */
export const DICTIONARIES_MCP_USER: Record<Language, Record<KeyMcpUser, MessageText>> = { fr, en };

/** Text read by the AI only: always in English. */
export function tm(key: KeyMcp, params?: Params): string {
  return translate(en[key], 'en', params);
}

/** Text shown to the user verbatim, in the user's language (the process language, set from the configuration). */
export function tu(key: KeyMcpUser, params?: Params): string {
  return translate(DICTIONARIES_MCP_USER[languageCurrent()][key], languageCurrent(), params);
}

/** User text in all the languages (object expected by the functions that choose the language themselves). */
export function bt(key: KeyMcpUser, params?: Params): Bilingual {
  return Object.fromEntries(LANGUAGES.map((l) => [l, translate(DICTIONARIES_MCP_USER[l][key], l, params)])) as Bilingual;
}

/** Text already given per language, in the current language. */
export function bi(x: Bilingual): string {
  return x[languageCurrent()];
}

/** English name of a language code ("fr" → "French"), for the instructions given to the AI. */
export function languageNameEn(code: Language): string {
  return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
}
