// Keys of the TanStack Query cache, built in one place for every useQuery, invalidateQueries and setQueryData.
// Each function returns the same array as the literal it replaced: the cache behaves exactly as before.

export const queryKeys = {
  /** Every page of the list of offers (prefix: invalidates them all). */
  offers: () => ['offers'] as const,
  /** One page of the list: the request of the table (filters, sort, page, size) as a query string. */
  offersPage: (request: string) => ['offers', request] as const,
  /** Every offer in detail (prefix). */
  offerAll: () => ['offer'] as const,
  /** One offer in detail. */
  offer: (id: number) => ['offer', id] as const,
  /** Files of the application folder of an offer. */
  files: (id: number) => ['files', id] as const,
  /** Values offered by the filters (sources, tags, statuses…). */
  meta: () => ['meta'] as const,
  /** Scoring grid. */
  rubric: () => ['rubric'] as const,
  /** Every version list of the grid (prefix). */
  rubricHistoryAll: () => ['rubric-history'] as const,
  /** Versions of the grid, keyed by the current version. */
  rubricHistory: (current: number | null) => ['rubric-history', current] as const,
  /** Impact of a grid being edited (the grid as JSON). */
  rubricPreview: (rubric: string) => ['rubric-preview', rubric] as const,
  deadlines: () => ['deadlines'] as const,
  statistics: () => ['statistics'] as const,
  work: () => ['work'] as const,
  mail: () => ['mail'] as const,
  health: () => ['health'] as const,
};
