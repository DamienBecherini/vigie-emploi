// Language of the interface: the one chosen in the header (remembered in localStorage) wins over the
// configuration's (returned by /api/health); French otherwise. The language change redraws the whole application
// (main.tsx remounts it): the components simply call t().
import { useSyncExternalStore } from 'react';
import { createTranslator, isLanguage, LANGUAGE_DEFAULT, LOCALES, type Language } from '../../../src/i18n/tool.ts';
import { labelLevel, labelStatus, labelType, messageFlag } from '../../../src/i18n/labels.ts';
import { defineLanguage as defineLanguageCore } from '../../../src/i18n/index.ts';
import type { Status, TypeEvent } from '../../../src/core/statuses.ts';
import type { Flag, Level } from '../../../src/core/rubric.ts';
import { en } from './en.ts';
import { fr, type KeyUi } from './fr.ts';

export type { KeyUi, Language };
export { LANGUAGES, NAMES_LANGUAGES } from '../../../src/i18n/tool.ts';

export const DICTIONARIES_UI = { fr, en };

const KEY = 'vigie-emploi:language';
let current: Language = LANGUAGE_DEFAULT;
const listeners = new Set<() => void>();

export function language(): Language {
  return current;
}

/** Intl locale of the current language (dates, numbers). */
export function locale(): string {
  return LOCALES[current];
}

export const t = createTranslator<KeyUi>(DICTIONARIES_UI, language);

function apply(l: Language) {
  current = l;
  // Core messages computed in the browser (rubric validation, justifications of the examples).
  defineLanguageCore(l);
  // globalThis: this module is also loaded by the tests (Node, without DOM).
  const doc = (globalThis as { document?: { documentElement: { lang: string } } }).document;
  if (doc) doc.documentElement.lang = l;
  for (const f of listeners) f();
}

/** Language chosen in the header, if it was remembered. */
function remembered(): Language | null {
  try {
    const v = localStorage.getItem(KEY);
    return isLanguage(v) ? v : null;
  } catch {
    return null;
  }
}

/** The user's choice (header selector): remembered, it then wins over the configuration. */
export function chooseLanguage(l: Language): void {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* stockage indisponible : le choix vaut pour la session */
  }
  apply(l);
}

/** On load: remembered language, otherwise the configuration's (/api/health), otherwise French. */
export async function initializeLanguage(): Promise<void> {
  const chosen = remembered();
  if (chosen) return apply(chosen);
  try {
    const r = await fetch('/api/health');
    const body = (await r.json()) as { language?: unknown };
    apply(isLanguage(body.language) ? body.language : LANGUAGE_DEFAULT);
  } catch {
    apply(LANGUAGE_DEFAULT);
  }
}

export function useLanguage(): Language {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => current,
  );
}

/** Number in the language's format ("6,5" / "6.5"). */
export function number(n: number, decimals = 2): string {
  return n.toLocaleString(locale(), { maximumFractionDigits: decimals });
}

/** YYYY-MM-DD (or ISO) date in the language's format: DD/MM/YYYY in both cases. */
export function dateShort(d: Date): string {
  return d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export const statusShown = (s: Status) => labelStatus(s, current);
export const typeShown = (x: TypeEvent) => labelType(x, current);
export const levelShown = (n: Level) => labelLevel(n, current);
export const flagShown = (d: Flag) => messageFlag(d, current);

/** Whole percentage in the language's format ("35 %" in French, "35%" in English). */
export function percent(n: number): string {
  return (Math.round(n) / 100).toLocaleString(locale(), { style: 'percent', maximumFractionDigits: 0 });
}
