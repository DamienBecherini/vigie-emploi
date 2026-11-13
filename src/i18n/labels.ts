// Libellés affichés des identifiants internes (statuts, types d'événement, niveaux d'inventaire), par langue.
// Les identifiants (nouvelle, envoyee, ecartee…) ne changent jamais : seuls les libellés sont traduits.
// Aucune dépendance Node : partagé avec l'interface.
import { LABELS_STATUSES, LABELS_TYPES, type Status, type TypeEvent } from '../core/statuses.ts';
import { LABELS_LEVELS, type Level } from '../core/rubric.ts';
import { LANGUAGE_DEFAULT, type Language } from './tool.ts';
import { tl } from './index.ts';

const STATUSES_EN: Record<Status, string> = {
  new: 'New',
  'to-read': 'To read',
  scored: 'Scored',
  dismissed: 'Discarded',
  go: 'Go',
  sent: 'Sent',
  'followed-up': 'Followed up',
  interview: 'Interview',
  rejected: 'Rejected',
  closed: 'Closed',
  withdrawn: 'Abandoned',
};

const TYPES_EN: Record<TypeEvent, string> = {
  message: 'Message',
  interview: 'Interview / call',
  test: 'Test',
  proposal: 'Offer / quote',
  decision: 'Decision',
  note: 'Note',
};

const LEVELS_EN: Record<Level, string> = { strong: 'Strong', medium: 'Medium', light: 'Light', zero: 'None' };

export const LABELS_STATUSES_BY_LANGUAGE: Record<Language, Record<Status, string>> = { fr: LABELS_STATUSES, en: STATUSES_EN };
export const LABELS_TYPES_BY_LANGUAGE: Record<Language, Record<TypeEvent, string>> = { fr: LABELS_TYPES, en: TYPES_EN };
export const LABELS_LEVELS_BY_LANGUAGE: Record<Language, Record<Level, string>> = { fr: LABELS_LEVELS, en: LEVELS_EN };

export function labelStatus(s: Status, language: Language): string {
  return LABELS_STATUSES_BY_LANGUAGE[language][s] ?? s;
}

export function labelType(t: TypeEvent, language: Language): string {
  return LABELS_TYPES_BY_LANGUAGE[language][t] ?? t;
}

export function labelLevel(n: Level, language: Language): string {
  return LABELS_LEVELS_BY_LANGUAGE[language][n] ?? n;
}

/**
 * Message d'un drapeau de note (calculé et enregistré en français dans la décomposition) dans la langue voulue,
 * d'après son code ; un code inconnu garde le message d'origine.
 */
export function messageFlag(d: { code: string; message: string }, language: Language): string {
  if (language === LANGUAGE_DEFAULT) return d.message;
  if (d.code === 'remote_unknown') return tl(language, 'flag.remoteUnknown');
  if (d.code === 'compensation_unknown') return tl(language, 'flag.compensationUnknown');
  if (d.code === 'sub_floor') {
    const value = d.message.match(/\(([^)]*)\)/)?.[1];
    return tl(language, 'flag.subFloor', { value: value ? ` (${value})` : '' });
  }
  if (d.code.startsWith('criterion_missing:')) {
    const label = d.message.split(' : ')[0] || d.code.slice('criterion_missing:'.length);
    return tl(language, 'flag.criterionMissing', { label });
  }
  return d.message;
}
