// Fixes noted during the real test in Claude Desktop (13/11/2026).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { textPdf } from '../src/core/extraction.ts';
import { applyChange } from '../src/core/rubric.ts';
import { EXAMPLE_RUBRIC, readFileRubric } from '../src/core/rubric-storage.ts';
import { APP_ROOT } from '../src/core/config.ts';

describe('dropped PDF: the links are read', () => {
  it('returns the address hidden behind “GitHub” in a CV', async () => {
    const r = await textPdf(readFileSync(join(APP_ROOT, 'docs', 'exemples', 'CV-damien-becherini-sobre.pdf')));
    expect(r.links).toHaveLength(r.pages);
    expect(r.links[0]).toContain('https://github.com/DamienBecherini');
    expect(r.text[0]).toContain('GitHub');
  });
});

describe('rubric: changing a rule does not touch the others', () => {
  const g = () => readFileRubric(EXAMPLE_RUBRIC)!.rubric;

  it('the rules not mentioned stay; only remove_rules deletes some', () => {
    const database = g();
    const ids = database.rules.map((r) => r.id);
    expect(ids).toContain('stage');
    const modified = applyChange(database, { rules: [{ id: 'sur-site-loin', value: 2 }, { id: 'devops', label: 'Poste DevOps', effect: 'cap', value: 3 }] });
    expect(modified.rules.map((r) => r.id)).toEqual([...ids, 'devops']);
    expect(modified.rules.find((r) => r.id === 'stage')).toEqual(database.rules.find((r) => r.id === 'stage'));
    const removed = applyChange(modified, { remove_rules: ['devops'] });
    expect(removed.rules.map((r) => r.id)).toEqual(ids);
  });
});
