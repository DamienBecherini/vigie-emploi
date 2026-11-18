// Displayed labels of the internal ids (statuses, event types, inventory levels), by language.
// The ids (new, sent, dismissed…) never change: only the labels are translated.
// No Node dependency: shared with the interface.
import type { Status, TypeEvent } from '../core/statuses.ts';
import type { Flag, Level } from '../core/rubric.ts';
import { LANGUAGE_DEFAULT, type Language } from './tool.ts';
import { decimal, tl } from './index.ts';

const STATUSES_FR: Record<Status, string> = {
  new: 'Nouvelle',
  'to-read': 'À lire',
  scored: 'Notée',
  dismissed: 'Écartée',
  go: 'Go',
  sent: 'Envoyée',
  'followed-up': 'Relancée',
  interview: 'Entretien',
  rejected: 'Refus',
  closed: 'Close',
  withdrawn: 'Abandonnée',
};

const TYPES_FR: Record<TypeEvent, string> = {
  message: 'Message',
  interview: 'Entretien / appel',
  test: 'Test',
  proposal: 'Proposition / devis',
  decision: 'Décision',
  note: 'Note',
};

const LEVELS_FR: Record<Level, string> = { strong: 'Fort', medium: 'Moyen', light: 'Léger', zero: 'Zéro' };

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

export const LABELS_STATUSES_BY_LANGUAGE: Record<Language, Record<Status, string>> = { fr: STATUSES_FR, en: STATUSES_EN };
export const LABELS_TYPES_BY_LANGUAGE: Record<Language, Record<TypeEvent, string>> = { fr: TYPES_FR, en: TYPES_EN };
export const LABELS_LEVELS_BY_LANGUAGE: Record<Language, Record<Level, string>> = { fr: LEVELS_FR, en: LEVELS_EN };

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
 * Message of a score flag in the wanted language. A flag carries a code and its values; the text is written here,
 * when it is shown. Scores saved before version 0.7 carry a French message instead: it is shown as it is in French,
 * and read again for its values in the other languages.
 */
export function messageFlag(d: Flag, language: Language): string {
  if (d.message !== undefined) return messageFlagSaved({ code: d.code, message: d.message }, language);
  if (d.code === 'remote_unknown') return tl(language, 'flag.remoteUnknown');
  if (d.code === 'compensation_unknown') return tl(language, 'flag.compensationUnknown');
  if (d.code === 'sub_floor') {
    const amount = d.params?.amount;
    const unit = tl(language, d.params?.unit === 'daily_rate' ? 'core.calc.unitTjm' : 'core.calc.unitSalary');
    return tl(language, 'flag.subFloor', { value: amount === undefined ? '' : ` (${decimal(Number(amount), language, 1)}${unit})` });
  }
  if (d.code.startsWith('criterion_missing:')) {
    return tl(language, 'flag.criterionMissing', { label: String(d.params?.label ?? d.code.slice('criterion_missing:'.length)) });
  }
  return d.code;
}

/** A flag saved with its French message (before version 0.7). */
function messageFlagSaved(d: { code: string; message: string }, language: Language): string {
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
