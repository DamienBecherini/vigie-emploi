// Langue de l'interface : celle choisie dans l'en-tête (mémorisée dans localStorage) l'emporte sur celle de la
// configuration (renvoyée par /api/sante) ; français à défaut. Le changement de langue redessine toute l'application
// (main.tsx la remonte) : les composants appellent simplement t().
import { useSyncExternalStore } from 'react';
import { createTranslator, isLanguage, LANGUAGE_DEFAULT, LOCALES, type Language } from '../../../src/i18n/tool.ts';
import { labelLevel, labelStatus, labelType, messageFlag } from '../../../src/i18n/labels.ts';
import { defineLanguage as defineLanguageCore } from '../../../src/i18n/index.ts';
import type { Status, TypeEvent } from '../../../src/core/statuses.ts';
import type { Level } from '../../../src/core/rubric.ts';
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

/** Locale Intl de la langue courante (dates, nombres). */
export function locale(): string {
  return LOCALES[current];
}

export const t = createTranslator<KeyUi>(DICTIONARIES_UI, language);

function apply(l: Language) {
  current = l;
  // Messages du noyau calculés dans le navigateur (validation de la grille, justifications des exemples).
  defineLanguageCore(l);
  // globalThis : ce module est aussi chargé par les tests (Node, sans DOM).
  const doc = (globalThis as { document?: { documentElement: { lang: string } } }).document;
  if (doc) doc.documentElement.lang = l;
  listeners.forEach((f) => f());
}

/** Langue choisie dans l'en-tête, si elle a été mémorisée. */
function remembered(): Language | null {
  try {
    const v = localStorage.getItem(KEY);
    return isLanguage(v) ? v : null;
  } catch {
    return null;
  }
}

/** Choix de l'utilisateur (sélecteur de l'en-tête) : mémorisé, il l'emporte ensuite sur la configuration. */
export function chooseLanguage(l: Language): void {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* stockage indisponible : le choix vaut pour la session */
  }
  apply(l);
}

/** Au chargement : langue mémorisée, sinon celle de la configuration (/api/sante), sinon le français. */
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

/** Nombre au format de la langue (« 6,5 » / « 6.5 »). */
export function number(n: number, decimals = 2): string {
  return n.toLocaleString(locale(), { maximumFractionDigits: decimals });
}

/** Date AAAA-MM-JJ (ou ISO) au format de la langue : JJ/MM/AAAA dans les deux cas. */
export function dateShort(d: Date): string {
  return d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export const statusShown = (s: Status) => labelStatus(s, current);
export const typeShown = (x: TypeEvent) => labelType(x, current);
export const levelShown = (n: Level) => labelLevel(n, current);
export const flagShown = (d: { code: string; message: string }) => messageFlag(d, current);

/** Pourcentage entier au format de la langue (« 35 % » en français, « 35% » en anglais). */
export function percent(n: number): string {
  return (Math.round(n) / 100).toLocaleString(locale(), { style: 'percent', maximumFractionDigits: 0 });
}
