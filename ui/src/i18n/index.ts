// Langue de l'interface : celle choisie dans l'en-tête (mémorisée dans localStorage) l'emporte sur celle de la
// configuration (renvoyée par /api/sante) ; français à défaut. Le changement de langue redessine toute l'application
// (main.tsx la remonte) : les composants appellent simplement t().
import { useSyncExternalStore } from 'react';
import { creerTraducteur, estLangue, LANGUE_DEFAUT, LOCALES, type Langue } from '../../../src/i18n/outil.ts';
import { libelleNiveau, libelleStatut, libelleType, messageDrapeau } from '../../../src/i18n/libelles.ts';
import { definirLangue as definirLangueNoyau } from '../../../src/i18n/index.ts';
import type { Statut, TypeEvenement } from '../../../src/core/statuts.ts';
import type { Niveau } from '../../../src/core/grille.ts';
import { en } from './en.ts';
import { fr, type CleUi } from './fr.ts';

export type { CleUi, Langue };
export { LANGUES } from '../../../src/i18n/outil.ts';

export const DICTIONNAIRES_UI = { fr, en };

const CLE = 'vigie-emploi:langue';
let courante: Langue = LANGUE_DEFAUT;
const auditeurs = new Set<() => void>();

export function langue(): Langue {
  return courante;
}

/** Locale Intl de la langue courante (dates, nombres). */
export function locale(): string {
  return LOCALES[courante];
}

export const t = creerTraducteur<CleUi>(DICTIONNAIRES_UI, langue);

function appliquer(l: Langue) {
  courante = l;
  // Messages du noyau calculés dans le navigateur (validation de la grille, justifications des exemples).
  definirLangueNoyau(l);
  // globalThis : ce module est aussi chargé par les tests (Node, sans DOM).
  const doc = (globalThis as { document?: { documentElement: { lang: string } } }).document;
  if (doc) doc.documentElement.lang = l;
  auditeurs.forEach((f) => f());
}

/** Langue choisie dans l'en-tête, si elle a été mémorisée. */
function memorisee(): Langue | null {
  try {
    const v = localStorage.getItem(CLE);
    return estLangue(v) ? v : null;
  } catch {
    return null;
  }
}

/** Choix de l'utilisateur (sélecteur de l'en-tête) : mémorisé, il l'emporte ensuite sur la configuration. */
export function choisirLangue(l: Langue): void {
  try {
    localStorage.setItem(CLE, l);
  } catch {
    /* stockage indisponible : le choix vaut pour la session */
  }
  appliquer(l);
}

/** Au chargement : langue mémorisée, sinon celle de la configuration (/api/sante), sinon le français. */
export async function initialiserLangue(): Promise<void> {
  const choisie = memorisee();
  if (choisie) return appliquer(choisie);
  try {
    const r = await fetch('/api/sante');
    const corps = (await r.json()) as { langue?: unknown };
    appliquer(estLangue(corps.langue) ? corps.langue : LANGUE_DEFAUT);
  } catch {
    appliquer(LANGUE_DEFAUT);
  }
}

export function useLangue(): Langue {
  return useSyncExternalStore(
    (f) => {
      auditeurs.add(f);
      return () => auditeurs.delete(f);
    },
    () => courante,
  );
}

/** Nombre au format de la langue (« 6,5 » / « 6.5 »). */
export function nombre(n: number, decimales = 2): string {
  return n.toLocaleString(locale(), { maximumFractionDigits: decimales });
}

/** Date AAAA-MM-JJ (ou ISO) au format de la langue : JJ/MM/AAAA dans les deux cas. */
export function dateCourte(d: Date): string {
  return d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export const statutAffiche = (s: Statut) => libelleStatut(s, courante);
export const typeAffiche = (x: TypeEvenement) => libelleType(x, courante);
export const niveauAffiche = (n: Niveau) => libelleNiveau(n, courante);
export const drapeauAffiche = (d: { code: string; message: string }) => messageDrapeau(d, courante);

/** Pourcentage entier au format de la langue (« 35 % » en français, « 35% » en anglais). */
export function pourcent(n: number): string {
  return (Math.round(n) / 100).toLocaleString(locale(), { style: 'percent', maximumFractionDigits: 0 });
}
