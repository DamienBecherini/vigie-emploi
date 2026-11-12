// Libellés affichés des identifiants internes (statuts, types d'événement, niveaux d'inventaire), par langue.
// Les identifiants (nouvelle, envoyee, ecartee…) ne changent jamais : seuls les libellés sont traduits.
// Aucune dépendance Node : partagé avec l'interface.
import { LIBELLES_STATUTS, LIBELLES_TYPES, type Statut, type TypeEvenement } from '../core/statuts.ts';
import { LIBELLES_NIVEAUX, type Niveau } from '../core/grille.ts';
import type { Langue } from './outil.ts';

const STATUTS_EN: Record<Statut, string> = {
  nouvelle: 'New',
  'a-lire': 'To read',
  notee: 'Scored',
  ecartee: 'Discarded',
  go: 'Go',
  envoyee: 'Sent',
  relancee: 'Followed up',
  entretien: 'Interview',
  refus: 'Rejected',
  close: 'Closed',
  abandonnee: 'Abandoned',
};

const TYPES_EN: Record<TypeEvenement, string> = {
  message: 'Message',
  entretien: 'Interview / call',
  test: 'Test',
  proposition: 'Offer / quote',
  decision: 'Decision',
  note: 'Note',
};

const NIVEAUX_EN: Record<Niveau, string> = { fort: 'Strong', moyen: 'Medium', leger: 'Light', zero: 'None' };

export const LIBELLES_STATUTS_PAR_LANGUE: Record<Langue, Record<Statut, string>> = { fr: LIBELLES_STATUTS, en: STATUTS_EN };
export const LIBELLES_TYPES_PAR_LANGUE: Record<Langue, Record<TypeEvenement, string>> = { fr: LIBELLES_TYPES, en: TYPES_EN };
export const LIBELLES_NIVEAUX_PAR_LANGUE: Record<Langue, Record<Niveau, string>> = { fr: LIBELLES_NIVEAUX, en: NIVEAUX_EN };

export function libelleStatut(s: Statut, langue: Langue): string {
  return LIBELLES_STATUTS_PAR_LANGUE[langue][s] ?? s;
}

export function libelleType(t: TypeEvenement, langue: Langue): string {
  return LIBELLES_TYPES_PAR_LANGUE[langue][t] ?? t;
}

export function libelleNiveau(n: Niveau, langue: Langue): string {
  return LIBELLES_NIVEAUX_PAR_LANGUE[langue][n] ?? n;
}

/**
 * Message d'un drapeau de note (calculé et enregistré en français dans la décomposition) dans la langue voulue,
 * d'après son code ; un code inconnu garde le message d'origine.
 */
export function messageDrapeau(d: { code: string; message: string }, langue: Langue): string {
  if (langue === 'fr') return d.message;
  if (d.code === 'teletravail_inconnu') return 'Remote work unknown (neutral value): to check';
  if (d.code === 'remuneration_inconnue') return 'Pay unknown (neutral value): to ask';
  if (d.code === 'sous_plancher') {
    const valeur = d.message.match(/\(([^)]*)\)/)?.[1];
    return `Pay below the floor${valeur ? ` (${valeur})` : ''}: to point out`;
  }
  if (d.code.startsWith('critere_manquant:')) {
    const libelle = d.message.split(' : ')[0] || d.code.slice('critere_manquant:'.length);
    return `${libelle}: no sub-score (neutral value 5)`;
  }
  return d.message;
}
