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

/**
 * Clic sur un en-tête. Sans Maj : la colonne devient le seul niveau (décroissant, ou inversé si elle l'était déjà).
 * Avec Maj : ajoute la colonne comme niveau suivant (décroissant) ; si elle y est déjà, décroissant → croissant → retirée.
 */
export function basculerNiveau(niveaux: Niveau[], colonne: string, ajouter: boolean): Niveau[] {
  const actuel = niveaux.find((n) => n.colonne === colonne);
  if (!ajouter) {
    const seul = niveaux.length === 1 && actuel;
    return [{ colonne, ordre: seul && actuel.ordre === 'desc' ? 'asc' : 'desc' }];
  }
  if (!actuel) return [...niveaux, { colonne, ordre: 'desc' }];
  if (actuel.ordre === 'desc') return niveaux.map((n) => (n.colonne === colonne ? { ...n, ordre: 'asc' } : n));
  const reste = niveaux.filter((n) => n.colonne !== colonne);
  return reste.length ? reste : [{ colonne, ordre: 'desc' }];
}
