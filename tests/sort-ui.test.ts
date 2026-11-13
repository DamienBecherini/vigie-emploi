import { describe, expect, it } from 'vitest';
import { toggleLevel, writeLevels, readLevels } from '../ui/src/sort.ts';

describe('tri sur plusieurs niveaux (tableau de bord)', () => {
  it('lit l’URL, y compris l’ancien format tri + ordre', () => {
    expect(readLevels('received_at:desc,score:asc')).toEqual([
      { column: 'received_at', order: 'desc' },
      { column: 'score', order: 'asc' },
    ]);
    expect(readLevels('score', 'asc')).toEqual([{ column: 'score', order: 'asc' }]);
    expect(readLevels(null)).toEqual([{ column: 'received_at', order: 'desc' }]);
    expect(writeLevels(readLevels('received_at,score'))).toBe('received_at:desc,score:desc');
  });

  it('comme Thunderbird : le tri précédent devient secondaire', () => {
    // Trier par note puis par date : date en principal, note à date égale.
    let n = toggleLevel(readLevels('received_at:desc'), 'score');
    expect(writeLevels(n)).toBe('score:desc,received_at:desc');
    n = toggleLevel(n, 'received_at');
    expect(writeLevels(n)).toBe('received_at:desc,score:desc');
    // Second clic sur le principal : il s'inverse, le secondaire reste.
    expect(writeLevels(toggleLevel(n, 'received_at'))).toBe('received_at:asc,score:desc');
    // Une troisième colonne chasse le plus ancien niveau : deux niveaux au plus.
    expect(writeLevels(toggleLevel(n, 'company'))).toBe('company:desc,received_at:desc');
  });
});
