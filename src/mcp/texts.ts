// Texts of the MCP server in the process's language (set at startup from the configuration, then at each
// change of workspace): instructions, descriptions of the tools and their parameters, results and errors.
// The texts live in the dictionaries src/mcp/i18n/<language>.ts, like those of the CLI and the interface:
// one more language only takes a translation file (docs/ajouter-une-langue.md).
import { languageCurrent, LANGUAGES, type Language } from '../i18n/index.ts';
import { translate, type Params, type MessageText } from '../i18n/tool.ts';
import { en } from './i18n/en.ts';
import { fr, type KeyMcp } from './i18n/fr.ts';

export type { KeyMcp };
export type Bilingual = Record<Language, string>;

export const DICTIONARIES_MCP: Record<Language, Record<KeyMcp, MessageText>> = { fr, en };

/** Text in the current language. */
export function tm(key: KeyMcp, params?: Params): string {
  return translate(DICTIONARIES_MCP[languageCurrent()][key], languageCurrent(), params);
}

/** Text in all the languages (object expected by the functions that choose the language themselves). */
export function bt(key: KeyMcp, params?: Params): Bilingual {
  return Object.fromEntries(LANGUAGES.map((l) => [l, translate(DICTIONARIES_MCP[l][key], l, params)])) as Bilingual;
}

/** Text already given per language, in the current language. */
export function bi(x: Bilingual): string {
  return x[languageCurrent()];
}
