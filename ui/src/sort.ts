// Sort of the list on several levels, as written in the URL: "received_at:desc,score:desc".
// The server validates the columns (levelsSort in src/core/queries.ts); here the string is only read and written.

export interface Level {
  column: string;
  order: 'asc' | 'desc';
}

/** Reads `?sort=`: a level without a direction takes `orderDefault` (old format `?sort=score&order=asc`). */
export function readLevels(sort: string | null, orderDefault: 'asc' | 'desc' = 'desc'): Level[] {
  const levels: Level[] = [];
  for (const chunk of (sort ?? '').split(',')) {
    const [column, direction] = chunk.trim().split(':').map((x) => x.trim());
    if (!column || levels.some((n) => n.column === column)) continue;
    levels.push({ column, order: direction === 'asc' || direction === 'desc' ? direction : orderDefault });
  }
  return levels.length ? levels : [{ column: 'received_at', order: orderDefault }];
}

export function writeLevels(levels: Level[]): string {
  return levels.map((n) => `${n.column}:${n.order}`).join(',');
}

/** Levels kept: the primary sort and the previous one, like Thunderbird. */
export const LEVELS_MAX = 2;

/**
 * Click on a header, Thunderbird style. On the primary sort: it is reversed, the secondary stays.
 * On another column: it becomes the primary sort (descending) and the old primary becomes secondary.
 */
export function toggleLevel(levels: Level[], column: string): Level[] {
  const [principal] = levels;
  if (principal?.column === column) {
    return [{ column, order: principal.order === 'desc' ? 'asc' : 'desc' }, ...levels.slice(1)];
  }
  const rest = levels.filter((n) => n.column !== column);
  return [{ column, order: 'desc' as const }, ...rest].slice(0, LEVELS_MAX);
}
