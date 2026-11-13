// Statuts d'une offre, partagés par la CLI, l'API et l'interface (aucune dépendance Node ici).

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

/** « Mes candidatures » : statuts envoyee et suivants. */
export const STATUSES_APPLICATION: Status[] = ['sent', 'followed-up', 'interview', 'rejected', 'closed'];

/** Offres suivies (go et au-delà) : une alerte, un lot ou le registre ne changent plus leur statut. */
export const STATUSES_TRACKED: Status[] = ['go', 'sent', 'followed-up', 'interview', 'rejected', 'closed', 'withdrawn'];

/** Offres à lire et noter. */
export const STATUSES_TO_PROCESS: Status[] = ['new', 'to-read'];

export function isStatus(s: string): s is Status {
  return (STATUSES as readonly string[]).includes(s);
}

/** Colonnes triables de la liste des offres. */
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

// Journal des candidatures (événements datés).
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
