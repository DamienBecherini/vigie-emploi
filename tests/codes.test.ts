// What the application saves carries codes and values, not sentences: a score made in an English workspace holds no
// French text, and the same score reads in French or in English when it is shown.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scoreOffers } from '../src/core/actions.ts';
import { addStatus, applicationOf, saveApplication, saveOffer, scoresOffer } from '../src/core/offers.ts';
import { exampleRubric, readFileRubric } from '../src/core/rubric-storage.ts';
import { computeScore, summaryRules, type Flag } from '../src/core/rubric.ts';
import { openDatabase } from '../src/db/database.ts';
import { defineLanguage } from '../src/i18n/index.ts';
import { labelLevel, labelStatus, labelType, messageFlag } from '../src/i18n/labels.ts';

afterEach(() => defineLanguage('fr'));

const rubric = () => readFileRubric(exampleRubric('en'))!.rubric;
const FRENCH = /[àâçèêëîïôùûœ]|télétravail|rémunération|plafond|sous-note/i;

describe('flags of a score', () => {
  it('are saved as a code and its values, with no sentence', () => {
    defineLanguage('en');
    const b = computeScore(rubric(), { criteria: {}, inputs: { salary_min: 20000, salary_max: 20000, unit: 'year' }, blockers: [] }, {});
    const codes = b.flags.map((f) => f.code);
    expect(codes).toContain('remote_unknown');
    expect(codes).toContain('sub_floor');
    expect(codes.some((c) => c.startsWith('criterion_missing:'))).toBe(true);
    for (const f of b.flags) expect(f).not.toHaveProperty('message');
    expect(b.flags.find((f) => f.code === 'sub_floor')!.params).toEqual({ amount: 20, unit: 'salary' });
    expect(JSON.stringify(b.flags)).not.toMatch(FRENCH);
  });

  it('read in the language of whoever looks at them', () => {
    const under: Flag = { code: 'sub_floor', params: { amount: 20.5, unit: 'salary' } };
    expect(messageFlag(under, 'fr')).toBe('Rémunération sous le plancher (20,5 K€/an) : à signaler');
    expect(messageFlag(under, 'en')).toBe('Pay below the floor (20.5K a year): to point out');
    expect(messageFlag({ code: 'sub_floor', params: { amount: 300, unit: 'daily_rate' } }, 'en')).toBe('Pay below the floor (300 a day): to point out');
    expect(messageFlag({ code: 'remote_unknown' }, 'en')).toMatch(/^Remote work unknown/);
    expect(messageFlag({ code: 'compensation_unknown' }, 'fr')).toMatch(/^Rémunération inconnue/);
    expect(messageFlag({ code: 'criterion_missing:technique', params: { label: 'Technical fit' } }, 'en')).toBe(
      'Technical fit: no sub-score (neutral value 5)',
    );
    expect(messageFlag({ code: 'something_new' }, 'en')).toBe('something_new');
  });

  it('a score saved before version 0.7, with its French message, still reads in both languages', () => {
    const old: Flag = { code: 'sub_floor', message: 'Rémunération sous le plancher (38 K€/an) : à signaler' };
    expect(messageFlag(old, 'fr')).toBe(old.message);
    expect(messageFlag(old, 'en')).toBe('Pay below the floor (38 K€/an): to point out');
    const missing: Flag = { code: 'criterion_missing:role', message: 'Rôle : pas de sous-note (valeur neutre 5)' };
    expect(messageFlag(missing, 'en')).toBe('Rôle: no sub-score (neutral value 5)');
  });
});

describe('a score made in an English workspace', () => {
  it('holds no French text: breakdown, summary of the rules, warnings', () => {
    defineLanguage('en');
    const db = openDatabase(':memory:');
    const { offer } = saveOffer(db, 'linkedin', '1', { title: 'Developer', remote: '2 days on site' }, 'manual');
    const g = rubric();
    const blocker = g.rules.find((r) => r.active && r.effect === 'cap')!.id;
    const [r] = scoreOffers(db, [{ id: offer.id, criteria: {}, blockers: [blocker] }], 'cli', {
      rubric: () => ({ version: 1, at: '', author: 'cli', summary: '', rubric: g }),
    });
    expect(r.warnings!.join(' ')).toMatch(/no sub-score/);
    const saved = scoresOffer(db, offer.id)[0];
    expect(JSON.stringify(saved.breakdown)).not.toMatch(FRENCH);
    expect(saved.penalties).toMatch(/^cap \d/);
    expect(saved.penalties).not.toMatch(FRENCH);
    expect(summaryRules(saved.breakdown!)).toBe(saved.penalties);
  });
});

describe('labels', () => {
  it('of statuses, event types and levels come from the tables of each language', () => {
    expect([labelStatus('sent', 'fr'), labelStatus('sent', 'en')]).toEqual(['Envoyée', 'Sent']);
    expect([labelType('interview', 'fr'), labelType('interview', 'en')]).toEqual(['Entretien / appel', 'Interview / call']);
    expect([labelLevel('strong', 'fr'), labelLevel('strong', 'en')]).toEqual(['Fort', 'Strong']);
  });
});

describe('moving to "sent"', () => {
  it('clears a next action that was to send the application, in French or in English, and no other', () => {
    const db = openDatabase(':memory:');
    const cases: [string, string | null][] = [
      ['Envoyer la candidature', null],
      ['Send the application', null],
      ['send it on Monday', null],
      ['Call the recruiter', 'Call the recruiter'],
      ['Relancer', 'Relancer'],
    ];
    cases.forEach(([action, expected], i) => {
      const { offer } = saveOffer(db, 'linkedin', String(i), { title: 'Developer' }, 'manual');
      saveApplication(db, offer.id, { next_action: action });
      addStatus(db, offer.id, 'sent');
      expect(applicationOf(db, offer.id)!.next_action, action).toBe(expected);
    });
  });
});

describe('the code', () => {
  const src = resolve(import.meta.dirname, '..', 'src');
  /** Where French text belongs: the dictionaries, the reading of French input, the import of a French-format history. */
  const ALLOWED = [/^i18n[\\/]/, /^mcp[\\/]i18n[\\/]/, /^import[\\/]/, /^core[\\/]text\.ts$/];
  const files = (folder: string): string[] =>
    readdirSync(folder).flatMap((n) => {
      const p = join(folder, n);
      return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
    });

  it('holds no French sentence outside the dictionaries (a text to show goes through t())', () => {
    const found: string[] = [];
    for (const file of files(src)) {
      const rel = relative(src, file);
      if (ALLOWED.some((a) => a.test(rel))) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
          // Quoted texts of the line, without the regular expressions (which read what people write) and without "résumé".
          const texts = (line.replace(/\/(?![*/])(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n])+\/[dgimsuvy]*/g, '').match(/'[^'\n]*'|"[^"\n]*"|`[^`\n]*`/g) ?? []).join(
            ' ',
          );
          if (/[àâçéèêëîïôùûœ]/i.test(texts.replace(/résumés?/gi, ''))) found.push(`${rel}:${i + 1}`);
        });
    }
    expect(found).toEqual([]);
  });
});
