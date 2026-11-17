// Statuses of an offer, shared by the CLI, the API and the interface (no Node dependency here).

export const STATUSES = [
  'new',
  'to-read',
  'scored',
  'dismissed',
  'go',
  'sent',
  'followed-up',
  'interview',
  'rejected',
  'closed',
  'withdrawn',
] as const;

export type Status = (typeof STATUSES)[number];

export const LABELS_STATUSES: Record<Status, string> = {
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

/** "My applications": sent status and the following ones. */
export const STATUSES_APPLICATION: Status[] = ['sent', 'followed-up', 'interview', 'rejected', 'closed'];

/** Tracked offers (go and beyond): an alert, a batch or the register no longer change their status. */
export const STATUSES_TRACKED: Status[] = ['go', 'sent', 'followed-up', 'interview', 'rejected', 'closed', 'withdrawn'];

/** Offers to read and score. */
export const STATUSES_TO_PROCESS: Status[] = ['new', 'to-read'];

export function isStatus(s: string): s is Status {
  return (STATUSES as readonly string[]).includes(s);
}

/** Sortable columns of the offer list. */
export const COLUMNS_SORT = [
  'id',
  'score',
  'received_at',
  'published_at',
  'title',
  'company',
  'location',
  'contract',
  'source',
  'status',
  'compensation_min',
  'remote',
  'updated_at',
] as const;
export type ColumnSort = (typeof COLUMNS_SORT)[number];

// Application journal (dated events).
export const TYPES_EVENT = ['message', 'interview', 'test', 'proposal', 'decision', 'note'] as const;
export type TypeEvent = (typeof TYPES_EVENT)[number];
export const DIRECTION_MESSAGE = ['sent', 'received'] as const;
export type Direction = (typeof DIRECTION_MESSAGE)[number];
export const ORIGINS_EVENT = ['interface', 'cli', 'mcp', 'import'] as const;
export type OriginEvent = (typeof ORIGINS_EVENT)[number];

export const LABELS_TYPES: Record<TypeEvent, string> = {
  message: 'Message',
  interview: 'Entretien / appel',
  test: 'Test',
  proposal: 'Proposition / devis',
  decision: 'Décision',
  note: 'Note',
};
