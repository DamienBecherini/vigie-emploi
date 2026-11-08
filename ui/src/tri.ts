// Tri de la liste sur plusieurs niveaux, tel qu'il s'écrit dans l'URL : « recue_le:desc,note:desc ».
// Le serveur valide les colonnes (niveauxTri dans src/core/requetes.ts) ; ici on ne fait que lire et écrire la chaîne.

export interface Niveau {
  colonne: string;
  ordre: 'asc' | 'desc';
}

/** Lit `?tri=` : un niveau sans sens prend `ordreDefaut` (ancien format `?tri=note&ordre=asc`). */
export function lireNiveaux(tri: string | null, ordreDefaut: 'asc' | 'desc' = 'desc'): Niveau[] {
  const niveaux: Niveau[] = [];
  for (const morceau of (tri ?? '').split(',')) {
    const [colonne, sens] = morceau.trim().split(':').map((x) => x.trim());
    if (!colonne || niveaux.some((n) => n.colonne === colonne)) continue;
    niveaux.push({ colonne, ordre: sens === 'asc' || sens === 'desc' ? sens : ordreDefaut });
  }
  return niveaux.length ? niveaux : [{ colonne: 'recue_le', ordre: ordreDefaut }];
}

export function ecrireNiveaux(niveaux: Niveau[]): string {
  return niveaux.map((n) => `${n.colonne}:${n.ordre}`).join(',');
}

/** Niveaux gardés : le tri principal et le précédent, comme Thunderbird. */
export const NIVEAUX_MAX = 2;

/**
 * Clic sur un en-tête, à la manière de Thunderbird. Sur le tri principal : il s'inverse, le secondaire reste.
 * Sur une autre colonne : elle devient le tri principal (décroissant) et l'ancien principal passe en secondaire.
 */
export function basculerNiveau(niveaux: Niveau[], colonne: string): Niveau[] {
  const [principal] = niveaux;
  if (principal?.colonne === colonne) {
    return [{ colonne, ordre: principal.ordre === 'desc' ? 'asc' : 'desc' }, ...niveaux.slice(1)];
  }
  const reste = niveaux.filter((n) => n.colonne !== colonne);
  return [{ colonne, ordre: 'desc' as const }, ...reste].slice(0, NIVEAUX_MAX);
}
