import { describe, expect, it } from 'vitest';
import { toggleLevel, writeLevels, readLevels } from '../ui/src/sort.ts';

describe('sort on several levels (dashboard)', () => {
  it('lit l’URL, y compris l’ancien format tri + ordre', () => {
    expect(readLevels('received_at:desc,score:asc')).toEqual([
      { column: 'received_at', order: 'desc' },
      { column: 'score', order: 'asc' },
    ]);
    expect(readLevels('score', 'asc')).toEqual([{ column: 'score', order: 'asc' }]);
    expect(readLevels(null)).toEqual([{ column: 'received_at', order: 'desc' }]);
    expect(writeLevels(readLevels('received_at,score'))).toBe('received_at:desc,score:desc');
  });

  it('like Thunderbird: the previous sort becomes secondary', () => {
    // Sort by score then by date: date as the primary sort, score for equal dates.
    let n = toggleLevel(readLevels('received_at:desc'), 'score');
    expect(writeLevels(n)).toBe('score:desc,received_at:desc');
    n = toggleLevel(n, 'received_at');
    expect(writeLevels(n)).toBe('received_at:desc,score:desc');
    // Second click on the primary: it is reversed, the secondary stays.
    expect(writeLevels(toggleLevel(n, 'received_at'))).toBe('received_at:asc,score:desc');
    // A third column drives out the oldest level: two levels at most.
    expect(writeLevels(toggleLevel(n, 'company'))).toBe('company:desc,received_at:desc');
  });
});
