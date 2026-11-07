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

  it('comme Thunderbird : le tri précédent devient secondaire', () => {
    // Trier par note puis par date : date en principal, note à date égale.
    let n = basculerNiveau(lireNiveaux('recue_le:desc'), 'note');
    expect(ecrireNiveaux(n)).toBe('note:desc,recue_le:desc');
    n = basculerNiveau(n, 'recue_le');
    expect(ecrireNiveaux(n)).toBe('recue_le:desc,note:desc');
    // Second clic sur le principal : il s'inverse, le secondaire reste.
    expect(ecrireNiveaux(basculerNiveau(n, 'recue_le'))).toBe('recue_le:asc,note:desc');
    // Une troisième colonne chasse le plus ancien niveau : deux niveaux au plus.
    expect(ecrireNiveaux(basculerNiveau(n, 'entreprise'))).toBe('entreprise:desc,recue_le:desc');
  });
});
