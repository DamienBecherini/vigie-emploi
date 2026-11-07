import { describe, expect, it } from 'vitest';
import { basculerNiveau, ecrireNiveaux, lireNiveaux } from '../ui/src/tri.ts';

describe('tri sur plusieurs niveaux (tableau de bord)', () => {
  it('lit l’URL, y compris l’ancien format tri + ordre', () => {
    expect(lireNiveaux('recue_le:desc,note:asc')).toEqual([
      { colonne: 'recue_le', ordre: 'desc' },
      { colonne: 'note', ordre: 'asc' },
    ]);
    expect(lireNiveaux('note', 'asc')).toEqual([{ colonne: 'note', ordre: 'asc' }]);
    expect(lireNiveaux(null)).toEqual([{ colonne: 'recue_le', ordre: 'desc' }]);
    expect(ecrireNiveaux(lireNiveaux('recue_le,note'))).toBe('recue_le:desc,note:desc');
  });

  it('clic simple : un seul niveau, inversé au second clic', () => {
    const date = lireNiveaux('recue_le:desc');
    expect(basculerNiveau(date, 'note', false)).toEqual([{ colonne: 'note', ordre: 'desc' }]);
    expect(basculerNiveau(date, 'recue_le', false)).toEqual([{ colonne: 'recue_le', ordre: 'asc' }]);
    // Clic simple sur une colonne d'un tri à deux niveaux : on repart d'un seul niveau, décroissant.
    expect(basculerNiveau(lireNiveaux('recue_le:desc,note:desc'), 'note', false)).toEqual([{ colonne: 'note', ordre: 'desc' }]);
  });

  it('Maj + clic : ajoute un niveau, puis l’inverse, puis le retire', () => {
    let n = lireNiveaux('recue_le:desc');
    n = basculerNiveau(n, 'note', true);
    expect(ecrireNiveaux(n)).toBe('recue_le:desc,note:desc');
    n = basculerNiveau(n, 'note', true);
    expect(ecrireNiveaux(n)).toBe('recue_le:desc,note:asc');
    n = basculerNiveau(n, 'note', true);
    expect(ecrireNiveaux(n)).toBe('recue_le:desc');
    // Le dernier niveau ne disparaît pas : il revient en décroissant.
    expect(ecrireNiveaux(basculerNiveau(lireNiveaux('note:asc'), 'note', true))).toBe('note:desc');
  });
});
