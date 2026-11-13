// Tri de la liste sur plusieurs niveaux, tel qu'il s'écrit dans l'URL : « recue_le:desc,note:desc ».
// Le serveur valide les colonnes (niveauxTri dans src/core/requetes.ts) ; ici on ne fait que lire et écrire la chaîne.

export interface Level {
  column: string;
  order: 'asc' | 'desc';
}

/** Lit `?tri=` : un niveau sans sens prend `ordreDefaut` (ancien format `?tri=note&ordre=asc`). */
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

/** Niveaux gardés : le tri principal et le précédent, comme Thunderbird. */
export const LEVELS_MAX = 2;

/**
 * Clic sur un en-tête, à la manière de Thunderbird. Sur le tri principal : il s'inverse, le secondaire reste.
 * Sur une autre colonne : elle devient le tri principal (décroissant) et l'ancien principal passe en secondaire.
 */
export function toggleLevel(levels: Level[], column: string): Level[] {
  const [principal] = levels;
  if (principal?.column === column) {
    return [{ column, order: principal.order === 'desc' ? 'asc' : 'desc' }, ...levels.slice(1)];
  }
  const rest = levels.filter((n) => n.column !== column);
  return [{ column, order: 'desc' as const }, ...rest].slice(0, LEVELS_MAX);
}
