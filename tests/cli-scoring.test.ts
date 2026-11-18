// CLI (src/cli/main.ts), safety net before the file is split: score, rubric, rescore, and show with a breakdown.
import { cpSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { cli, FIXTURES, isolate, parsed, workspace } from './cli-helpers.ts';

vi.mock('../src/db/database.ts', async (original) => (await import('./cli-databases.ts')).trackDatabases(original));

const tmp = isolate('scoring');
let run: Awaited<ReturnType<typeof workspace>>;

/** Offer 4 (LinkedIn, "Développeur PHP / WordPress senior") scored with the criteria of the sample grid: 7.65 → 7.5. */
const CRITERIA = JSON.stringify({
  id: 4,
  criteria: { technique: { score: 8, justification: 'PHP' }, role: { score: 7 }, interet: { score: 6 }, risque: { score: 7 } },
  inputs: { onsite_days: 1, salary_min: 60000, unit: 'year' },
  blockers: [],
  fit: 'PHP, APIs',
  gaps: 'Docker',
});

interface Scoring {
  ok: boolean;
  dry_run: boolean;
  scored: number;
  offers: { id: number; score: number; status: string; rubric_version: number | null; exact_score: number | null }[];
}

beforeAll(async () => {
  const ws = `${tmp.root()}/ws`;
  run = await workspace(ws);
  cpSync(`${FIXTURES}/emails`, `${ws}/emails`, { recursive: true });
  expect((await run('ingest', '--no-fetch', '--no-mail')).code).toBe(0);
});

describe('score', () => {
  it('--json inline with criteria, --dry_run: computed, nothing saved', async () => {
    const r = parsed<Scoring>(await run('score', '--json', CRITERIA, '--dry_run'));
    expect(r).toMatchObject({ ok: true, dry_run: true, scored: 0 });
    expect(r.offers[0]).toMatchObject({ id: 4, score: 7.5, exact_score: 7.65, rubric_version: 1, status: 'scored' });
    expect(parsed<{ status: string; score: number | null }>(await run('show', '4', '--json'))).toMatchObject({ status: 'new', score: null });
  });

  it('--json inline with criteria: saved', async () => {
    const r = parsed<Scoring>(await run('score', '--json', CRITERIA));
    expect(r).toMatchObject({ ok: true, dry_run: false, scored: 1 });
    expect(r.offers[0]).toMatchObject({ id: 4, score: 7.5 });
  });

  it('plain score with the id as a positional argument', async () => {
    const r = parsed<Scoring>(await run('score', '3', '--json', '{"score":6,"fit":"ok","gaps":"far"}'));
    expect(r).toMatchObject({ ok: true, scored: 1 });
    expect(r.offers[0]).toMatchObject({ id: 3, score: 6, status: 'scored' });
  });

  it('--file: batch with an "offers" list and a byte order mark; blocking rule', async () => {
    const file = `${tmp.root()}/batch.json`;
    writeFileSync(
      file,
      `﻿${JSON.stringify({
        offers: [
          { id: 5, score: 4 },
          { id: 6, criteria: { technique: { score: 2 } }, blockers: ['stage'] },
        ],
      })}`,
    );
    const r = parsed<Scoring>(await run('score', '--file', file));
    expect(r.scored).toBe(2);
    expect(r.offers.map((o) => [o.id, o.score])).toEqual([
      [5, 4],
      [6, 0],
    ]);
  });

  it('show: breakdown of a criteria score, old-grid score, rule and flags', async () => {
    const four = await run('show', '4');
    expect(four.out).toContain('Status: Scored · Score: 7.5 · Source: linkedin (4100000001)');
    expect(four.out).toMatch(/Score 7\.5 \(grid v1, exact 7\.65\) on \d{4}-\d{2}-\d{2}T/);
    expect(four.out).toContain('  Technical fit                 8 ×  35 % =   2.8  PHP');
    expect(four.out).toContain('  Weighted average           7.65');
    expect(four.out).toContain('  Score: 7.65 → 7.5');
    expect(four.out).toContain('What fits: PHP, APIs\nGaps: Docker');
    const three = await run('show', '3');
    expect(three.out).toMatch(/Score 6 \(old grid; raw —\) on /);
    expect(three.out).toContain('What fits: ok\nGaps: far');
    const six = await run('show', '6');
    expect(six.out).toContain('(neutral) On-site pattern unknown: neutral value');
    expect(six.out).toContain('  Rule: Internship or apprenticeship → 0');
    expect(six.out).toContain('  ⚑ Pay unknown (neutral value): to ask');
  });

  it('errors: no input, several inputs for one id, unknown offer', async () => {
    const none = await run('score');
    expect(none).toMatchObject({ code: 1, err: "Error: score: --json '{...}' or --file lot.json expected\n" });
    const two = await run('score', '3', '--json', '[{"score":1},{"score":2}]');
    expect(two.code).toBe(1);
    expect(JSON.parse(two.err)).toEqual({ ok: false, error: 'score <id>: a single score expected', code: 'invalid' });
    const unknown = await run('score', '999', '--json', '{"score":5}');
    expect(unknown.code).toBe(1);
    expect(JSON.parse(unknown.err).ok).toBe(false);
  });
});

describe('rubric', () => {
  it('default view, text mode', async () => {
    const r = await run('rubric');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^Sample grid — version 1 of \d{4}-\d{2}-\d{2} \(file\): /);
    expect(r.out).toMatch(/File: .*profil[\\/]grille\.json · “worth a look” threshold: 4\.5/);
    expect(r.out).toContain('  technique       35 %  AI        Technical fit');
    expect(r.out).toContain('  teletravail     20 %  computed  Remote work and commute');
    expect(r.out).toContain('Remote work (0 to 5 days on site): 10 / 8 / 6 / 3 / 1 / 1; unknown 5');
    expect(r.out).toContain('  ● stage              0          Internship or apprenticeship');
    expect(r.out).toContain('  ● sur-site-loin      cap 3      On site outside the region, no remote work');
    expect(r.out).toContain('  Strong PHP, JavaScript, REST APIs, MySQL / MariaDB');
    expect(r.out).toContain('   7.5  Company A (fictitious) — Senior PHP Developer (example)');
    expect(r.out).not.toContain('Instructions for the AI:');
  });

  it('--instructions; --json with the AI instructions and the computed examples', async () => {
    expect((await run('rubric', '--instructions')).out).toContain('\nInstructions for the AI:\n- ');
    const j = parsed<{ ok: boolean; version: number; file: string; instructions_ai: string[]; computed_examples: { score: number }[] }>(
      await run('rubric', '--json'),
    );
    expect(j).toMatchObject({ ok: true, version: 1 });
    expect(j.file).toMatch(/profil[\\/]grille\.json$/);
    expect(j.instructions_ai.length).toBeGreaterThan(0);
    expect(j.computed_examples.map((e) => e.score)).toEqual([7.5, 3.5, 0]);
  });

  it('--init on an existing grid', async () => {
    expect(parsed(await run('rubric', '--init', '--json'))).toMatchObject({ ok: true, created: false, version: 1 });
    expect((await run('rubric', '--init')).out).toMatch(/^A grid already exists: .*grille\.json\n$/);
  });

  it('--update --dry_run: trial, examples before → after', async () => {
    const j = parsed<{ ok: boolean; saved: boolean; impact: { falling: { id: number }[] } }>(
      await run('rubric', '--update', '{"threshold":8}', '--dry_run', '--json'),
    );
    expect(j).toMatchObject({ ok: true, saved: false });
    expect(j.impact.falling.map((c) => c.id)).toEqual([4]);
    const r = await run('rubric', '--update', '{"threshold":8}', '--dry_run');
    expect(r.out).toMatch(/^Trial: nothing is saved\.\nReference examples \(before → after\):\n {6}7\.5 → 7\.5 {2}Senior PHP Developer/);
    expect(r.out).toContain('2 criterion-based offer(s) recomputed, 0 with a changed score.');
    expect(r.out).toContain('Back below the threshold 8 (1):\n  #4      7.5 → 7.5   Développeur PHP / WordPress senior');
    expect(parsed<{ version: number }>(await run('rubric', '--json')).version).toBe(1);
  });

  it('--update --summary: version saved', async () => {
    const r = await run('rubric', '--update', '{"threshold":8}', '--summary', 'stricter');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^Version 2 saved\.\n/);
    expect(r.out).toContain('Back below the threshold 8 (1):');
  });

  it('--history and --version', async () => {
    const h = parsed<{ ok: boolean; versions: { version: number; author: string; summary: string }[] }>(await run('rubric', '--history', '--json'));
    expect(h.versions.map((x) => [x.version, x.author, x.summary])).toEqual([
      [2, 'cli', 'stricter'],
      [1, 'file', 'vigie-emploi sample grid (to adapt)'],
    ]);
    const text = await run('rubric', '--history');
    expect(text.out).toMatch(/^ {2}v2 {4}\d{4}-\d{2}-\d{2} \d{2}:\d{2} {2}cli {7}stricter\n/);
    const v1 = parsed<{ version: number; rubric: { threshold: number } }>(await run('rubric', '--version', '1', '--json'));
    expect(v1).toMatchObject({ version: 1, rubric: { threshold: 4.5 } });
    expect((await run('rubric', '--version', '2')).out).toContain('“worth a look” threshold: 8');
  });

  it('--restore: new version, offers back above the threshold', async () => {
    const r = await run('rubric', '--restore', '1');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^Version 3: /);
    expect(r.out).toContain('Now above the threshold 4.5 (1):\n  #4      7.5 → 7.5   Développeur PHP / WordPress senior');
    const j = parsed<{ ok: boolean; version: number; impact: { rising: unknown[] } }>(await run('rubric', '--restore', '2', '--summary', 'again', '--json'));
    expect(j).toMatchObject({ ok: true, version: 4 });
  });

  it('errors: --update without summary, invalid JSON, invalid change, unknown version', async () => {
    expect((await run('rubric', '--update', '{"threshold":5}')).err).toBe('Error: rubric --update: --summary "…" expected (or --dry-run for a preview)\n');
    expect((await run('rubric', '--update', 'nope', '--dry_run')).err).toMatch(/^Error: rubric --update: invalid JSON \(/);
    expect((await run('rubric', '--update', '{"threshold":"high"}', '--dry_run')).code).toBe(1);
    expect((await run('rubric', '--version', '99')).code).toBe(1);
    expect((await run('rubric', '--restore', '0')).err).toBe('Error: Invalid version: 0\n');
  });

  it('workspace without a grid: error, then --init copies the sample', async () => {
    const other = `${tmp.root()}/no-grid`;
    const runOther = await workspace(other);
    rmSync(`${other}/profil/grille.json`);
    const r = await runOther('rubric');
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/grille\.json/);
    // No grid yet: empty history, not an error.
    expect(await runOther('rubric', '--history')).toEqual({ code: 0, out: '', err: '' });
    expect((await runOther('rubric', '--init')).out).toMatch(/^Sample grid copied to .*grille\.json \(version 1\): adapt it\.\n$/);
  });
});

describe('rescore', () => {
  it('--json and text mode', async () => {
    const j = parsed<{ ok: boolean; version: number; impact: { offers_recalculated: number; changed: number } }>(await run('rescore', '--json'));
    expect(j).toMatchObject({ ok: true, version: 4, impact: { offers_recalculated: 2, changed: 0 } });
    const r = await run('rescore');
    expect(r.out).toBe('Grid v4.\n2 criterion-based offer(s) recomputed, 0 with a changed score.\n');
  });
});

describe('score: offer fields, cap rule, rule switched off', () => {
  it('old-grid score with the offer fields: detail lines, list with score and company', async () => {
    const input = {
      id: 7,
      company: 'Acme',
      location: 'Lyon',
      contract: 'Freelance',
      remote: 'full',
      stack: 'PHP, Symfony',
      description: 'Build APIs.',
      raw_score: 7,
      penalties: '-1 far',
      score: 6,
    };
    expect(parsed<Scoring>(await run('score', '--json', JSON.stringify(input))).offers[0]).toMatchObject({ id: 7, score: 6 });
    const r = await run('show', '7');
    expect(r.out).toMatch(/^#7 Développeur PHP freelance — Acme\n/);
    expect(r.out).toContain('\nLyon · Freelance · remote work: full\n');
    expect(r.out).toContain('\nStack: PHP, Symfony\n');
    expect(r.out).toMatch(/\nScore 6 \(old grid; raw 7, penalties: -1 far\) on /);
    expect(r.out).toMatch(/\nDescription:\nBuild APIs\.\n$/);
    const list = await run('list', '--sort', 'score', '--size', '1');
    expect(list.out).toMatch(/\n4\s+7\.5\s+scored\s+linkedin/);
    const acme = await run('list', '-q', 'Acme');
    expect(acme.out).toMatch(/\n7\s+6\s+scored\s+free-work\s+2026-10-30\s+Acme\s+Développeur PHP freelance\n/);
  });

  it('cap rule in the breakdown', async () => {
    const input = { id: 8, criteria: { technique: { score: 9 } }, inputs: { onsite_days: 5 }, blockers: ['sur-site-loin'] };
    expect(parsed<Scoring>(await run('score', '--json', JSON.stringify(input))).offers[0].score).toBe(3);
    expect((await run('show', '8')).out).toContain('  Rule: On site outside the region, no remote work → cap 3');
  });

  it('a blocker on a rule switched off is listed as ignored', async () => {
    const r = await run('rubric', '--update', '{"rules":[{"id":"stage","active":false}]}', '--summary', 'internships allowed');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/criterion-based offer\(s\) recomputed, [1-9]\d* with a changed score\./);
    expect((await run('rubric')).out).toContain('  ○ stage ');
    expect((await run('show', '6')).out).toContain('  Rule ignored (unknown or disabled): stage');
  });
});

describe('French', () => {
  it('rubric and score in French', async () => {
    const fr = `${tmp.root()}/fr`;
    const runFr = await workspace(fr, 'fr');
    const r = await runFr('rubric');
    expect(r.out).toContain('Critères (poids normalisés)');
    expect((await runFr('score')).err).toMatch(/^Erreur : score : /);
    expect((await cli('rescore', '--data', fr)).out).toMatch(/^Grille v1\./);
  });
});

describe('--dry-run and --dry_run', () => {
  it('score: the spelling of the help (--dry-run) is accepted, nothing saved', async () => {
    const before = parsed<{ score: number | null }>(await run('show', '3', '--json')).score;
    const r = parsed<Scoring>(await run('score', '3', '--json', '{"score":2,"fit":"x","gaps":"y"}', '--dry-run'));
    expect(r).toMatchObject({ ok: true, dry_run: true, scored: 0 });
    expect(r.offers[0]).toMatchObject({ id: 3, score: 2 });
    expect(parsed<{ score: number | null }>(await run('show', '3', '--json')).score).toBe(before);
  });

  it('rubric --update: --dry-run is a trial without a summary', async () => {
    const version = parsed<{ version: number }>(await run('rubric', '--json')).version;
    expect(parsed(await run('rubric', '--update', '{"threshold":9}', '--dry-run', '--json'))).toMatchObject({ ok: true, saved: false });
    expect((await run('rubric', '--update', '{"threshold":9}', '--dry-run')).out).toMatch(/^Trial: nothing is saved\./);
    expect(parsed<{ version: number }>(await run('rubric', '--json')).version).toBe(version);
  });
});

describe('errors of the core', () => {
  it('an expected error shows its message alone; a defect (stored version unreadable) its stack', async () => {
    const other = `${tmp.root()}/defect`;
    const runOther = await workspace(other);
    // The first read records the grid file as version 1.
    expect(parsed<{ version: number }>(await runOther('rubric', '--json')).version).toBe(1);
    expect(await runOther('rubric', '--version', '9')).toEqual({ code: 1, out: '', err: 'Error: Grid version 9 not found\n' });
    const db = new DatabaseSync(`${other}/data/vigie-emploi.sqlite`);
    db.prepare('UPDATE rubrics SET content = ? WHERE version = 1').run('{not json');
    db.close();
    const r = await runOther('rubric', '--version', '1');
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/^Error: SyntaxError: .*JSON[\s\S]*\n +at /);
  });
});
