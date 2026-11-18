// CLI (src/cli/main.ts), safety net before the file is split: apply, application, next-action, event, journal,
// deadlines, done, files, stats, generate-tracker.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { FIXTURES, isolate, parsed, workspace } from './cli-helpers.ts';

vi.mock('../src/db/database.ts', async (original) => (await import('./cli-databases.ts')).trackDatabases(original));

const tmp = isolate('applications');
let ws = '';
let run: Awaited<ReturnType<typeof workspace>>;

interface Event {
  id: number;
  offer_id: number;
  type: string;
  at: string;
  done: boolean;
  summary: string;
  direction: string | null;
  files: string[];
}

beforeAll(async () => {
  ws = `${tmp.root()}/ws`;
  run = await workspace(ws);
  cpSync(`${FIXTURES}/emails`, `${ws}/emails`, { recursive: true });
  expect((await run('ingest', '--no-fetch', '--no-mail')).code).toBe(0);
});

describe('apply', () => {
  it('--json: offer, suggested folder, steps', async () => {
    const r = parsed<{ offer: { id: number; status: string }; suggested_folder: string; steps: string[] }>(await run('apply', '4', '--json'));
    expect(r.offer).toMatchObject({ id: 4, status: 'go' });
    expect(r.suggested_folder).toMatch(/^candidatures\//);
    expect(r.steps.length).toBeGreaterThan(0);
  });

  it('text mode: detail, folder, numbered steps', async () => {
    const r = await run('apply', '5');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^#5 Ingénieur backend API & intégration\n/);
    expect(r.out).toContain('\nSuggested folder: candidatures/');
    expect(r.out).toMatch(/\n1\. .+\n2\. /);
  });

  it('unknown offer', async () => {
    expect((await run('apply', '999')).code).toBe(1);
  });
});

describe('application', () => {
  it('--json: fields saved, status', async () => {
    const r = parsed<{ ok: boolean; id: number; status: string; status_added: unknown; application: Record<string, unknown> }>(
      await run(
        'application',
        '4',
        '--folder',
        'candidatures/acme-php',
        '--cv',
        'cv/cv-acme.pdf',
        '--channel',
        'LinkedIn',
        '--sent-at',
        '2026-11-10',
        '--message',
        'Hello',
        '--next-action',
        'Follow up',
        '--json',
      ),
    );
    expect(r).toMatchObject({ ok: true, id: 4, status: 'sent' });
    expect(r.application).toMatchObject({ folder: 'candidatures/acme-php', channel: 'LinkedIn', sent_at: '2026-11-10', next_action: 'Follow up' });
  });

  it('text mode: detail without the description', async () => {
    const r = await run('application', '4', '--channel', 'E-mail');
    expect(r.code).toBe(0);
    expect(r.out).toContain('Application: candidatures/acme-php · E-mail · sent on 2026-11-10');
    expect(r.out).toContain('Next action: Follow up');
    expect(r.out).not.toContain('Description:');
  });

  it('errors: no option, unknown offer', async () => {
    expect((await run('application', '4')).err).toBe('Error: application: at least one option expected (--folder, --channel…)\n');
    expect((await run('application', '999', '--channel', 'x')).code).toBe(1);
  });
});

describe('next-action', () => {
  it('words joined, then cleared with -', async () => {
    expect(parsed(await run('next-action', '4', 'Call', 'back', 'on', 'Monday', '--json'))).toEqual({ ok: true, id: 4, next_action: 'Call back on Monday' });
    expect((await run('next-action', '4', 'Send', 'the', 'quote')).out).toBe('#4 : Send the quote\n');
    expect((await run('next-action', '4', '-')).out).toBe('#4 : (no next action)\n');
  });

  it('error: text missing', async () => {
    expect((await run('next-action', '4')).err).toBe('Error: next-action: text expected ("" or - to clear)\n');
  });
});

describe('event, journal, deadlines, done', () => {
  let message: Event;
  let overdue: Event;
  let upcoming: Event;

  it('event --json: message sent, done', async () => {
    const r = parsed<{ ok: boolean; event: Event }>(
      await run(
        'event',
        '4',
        '-t',
        'message',
        '-r',
        'Application sent',
        '--at',
        '2026-11-10T14:30',
        '--direction',
        'sent',
        '--channel',
        'LinkedIn',
        '--contacts',
        'Jane',
        '--details',
        'CV attached',
        '--file',
        'candidatures/acme-php/cv.pdf',
        '--file',
        'candidatures/acme-php/letter.md',
        '--done',
        '--json',
      ),
    );
    message = r.event;
    expect(r.ok).toBe(true);
    expect(message).toMatchObject({ offer_id: 4, type: 'message', at: '2026-11-10T14:30', done: true, direction: 'sent', summary: 'Application sent' });
    expect(message.files).toEqual(['candidatures/acme-php/cv.pdf', 'candidatures/acme-php/letter.md']);
  });

  it('event, text mode: deadlines past and future', async () => {
    const past = await run('event', '4', '--type', 'interview', '--summary', 'Interview with the team', '--at', '2020-01-02', '--no-done');
    expect(past.code).toBe(0);
    expect(past.out).toMatch(/^Event #\d+ added to offer #4: 02\/01\/2020 interview \(deadline\) — Interview with the team\n$/);
    const future = await run(
      'event',
      '4',
      '--type',
      'proposal',
      '--summary',
      'Quote',
      '--at',
      '+3',
      '--amount',
      '450',
      '--unit',
      '€/day',
      '--days',
      '20',
      '--no-done',
    );
    expect(future.code).toBe(0);
    const events = parsed<{ events: Event[] }>(await run('journal', '4', '--json')).events;
    overdue = events.find((e) => e.summary === 'Interview with the team')!;
    upcoming = events.find((e) => e.summary === 'Quote')!;
    expect(overdue.done).toBe(false);
    expect(upcoming.done).toBe(false);
  });

  it('event errors: type or summary missing, unknown type', async () => {
    expect((await run('event', '4', '--summary', 'x')).err).toBe('Error: event: --type expected (message, interview, test, proposal, decision, note)\n');
    expect((await run('event', '4', '--type', 'note')).err).toBe('Error: event: --summary "…" expected\n');
    expect((await run('event', '4', '--type', 'party', '--summary', 'x')).code).toBe(1);
    expect((await run('event', '4', '--type', 'note', '--summary', 'x', '--direction', 'sideways')).code).toBe(1);
  });

  it('journal: --json and text mode', async () => {
    const j = parsed<{ ok: boolean; id: number; events: Event[] }>(await run('journal', '4', '--json'));
    expect(j).toMatchObject({ ok: true, id: 4 });
    expect(j.events).toHaveLength(3);
    const r = await run('journal', '4');
    expect(r.out).toMatch(/^#4 Développeur PHP \/ WordPress senior\n/);
    expect(r.out).toContain(`  #${String(message.id).padEnd(5)} 10/11/2026 14:30    `);
    expect(r.out).toContain('message     → Application sent · candidatures/acme-php/cv.pdf, candidatures/acme-php/letter.md');
    expect(r.out).toContain('02/01/2020          OVERDUE   interview   Interview with the team');
    expect(r.out).toContain('to do     proposal    Quote · 450 €/day');
  });

  it('journal: empty, unknown offer', async () => {
    expect((await run('journal', '5')).out).toBe('#5 Ingénieur backend API & intégration\n  (empty journal)\n');
    expect((await run('journal', '999')).err).toBe('Error: Offer 999 not found\n');
  });

  it('show: journal and application in the detail', async () => {
    const r = await run('show', '4');
    expect(r.out).toContain('\nJournal:\n');
    expect(r.out).toContain('Application: candidatures/acme-php');
  });

  it('deadlines: --json, text mode, --days', async () => {
    const j = parsed<{ ok: boolean; overdue: { id: number }[]; upcoming: { id: number }[]; until: string }>(await run('deadlines', '--json'));
    expect(j.ok).toBe(true);
    expect(j.overdue.map((e) => e.id)).toEqual([overdue.id]);
    expect(j.upcoming.map((e) => e.id)).toEqual([upcoming.id]);
    expect(parsed<{ upcoming: unknown[] }>(await run('deadlines', '--days', '1', '--json')).upcoming).toEqual([]);
    const r = await run('deadlines');
    expect(r.out).toMatch(/^Overdue \(1\):\n/);
    expect(r.out).toContain(
      `  #${String(overdue.id).padEnd(5)} 02/01/2020          offer #4 Développeur PHP / WordPress… Interview / call : Interview with the team`,
    );
    expect(r.out).toMatch(/\nUpcoming until \d{2}\/\d{2}\/\d{4} \(1\):\n {2}#\d+ +\d{2}\/\d{2}\/\d{4} +offer #4 .+ Offer \/ quote : Quote\n$/);
  });

  it('deadlines: invalid number of days', async () => {
    expect((await run('deadlines', '--days', '-1')).code).toBe(1);
    // The error names the option and shows what was typed (not "NaN").
    expect(await run('deadlines', '--days', 'abc')).toEqual({ code: 1, out: '', err: 'Error: Invalid days: abc\n' });
    expect((await run('deadlines', '--days', '')).err).toBe('Error: Invalid days: \n');
    expect(parsed<{ ok: boolean }>(await run('deadlines', '--days', '0', '--json')).ok).toBe(true);
  });

  it('done: done, reopened, unknown event', async () => {
    const j = parsed<{ ok: boolean; event: Event }>(await run('done', String(overdue.id), '--json'));
    expect(j).toMatchObject({ ok: true, event: { id: overdue.id, done: true } });
    expect((await run('done', String(overdue.id), '--no-done')).out).toBe(`Event #${overdue.id} reopened (to do): Interview with the team\n`);
    expect((await run('done', String(overdue.id))).out).toBe(`Event #${overdue.id} done: Interview with the team\n`);
    expect((await run('done', '999')).code).toBe(1);
    expect((await run('done', 'x')).err).toBe('Error: Invalid event_id: x\n');
  });
});

describe('files', () => {
  it('no folder, missing folder, folder listed', async () => {
    expect((await run('files', '5')).out).toBe('#5: no application folder (vigie-emploi application 5 --folder candidatures/…)\n');
    expect(parsed(await run('files', '5', '--json'))).toMatchObject({ ok: true, folder: null });
    expect((await run('files', '4')).out).toBe('#4: folder candidatures/acme-php missing from the data folder\n');
    mkdirSync(`${ws}/candidatures/acme-php`, { recursive: true });
    writeFileSync(`${ws}/candidatures/acme-php/dossier-candidature.md`, '# Application\n');
    const j = parsed<{ ok: boolean; folder: string; exists: boolean; files: { path: string; size: number }[] }>(await run('files', '4', '--json'));
    expect(j).toMatchObject({ ok: true, folder: 'candidatures/acme-php', exists: true });
    expect(j.files.map((f) => f.path)).toEqual(['candidatures/acme-php/dossier-candidature.md']);
    const r = await run('files', '4');
    expect(r.out).toMatch(/^candidatures\/acme-php \(1 file\(s\)\):\n {2}candidatures\/acme-php\/dossier-candidature\.md +1 KB {2}\d{4}-\d{2}-\d{2}\n$/);
  });

  it('unknown offer', async () => {
    expect((await run('files', '999')).err).toBe('Error: Offer 999 not found\n');
  });
});

describe('stats', () => {
  it('--json and text mode', async () => {
    const j = parsed<{ ok: boolean; sent: number; average_reply_days: number | null }>(await run('stats', '--json'));
    expect(j).toMatchObject({ ok: true, sent: 1, average_reply_days: null });
    const r = await run('stats');
    expect(r.out).toBe('Sent: 1 · reply: 1 · interview: 1 · offer: 1\nDelay before the first reply: not enough dated data.\n');
  });

  it('average delay once a reply is dated; received message with an amount without unit', async () => {
    expect((await run('event', '4', '-t', 'message', '-r', 'Reply', '--at', '2026-11-13', '--direction', 'received', '--amount', '2', '--done')).code).toBe(0);
    expect((await run('journal', '4')).out).toContain('message     ← Reply · 2\n');
    const r = await run('stats');
    expect(r.out).toMatch(/\nAverage delay before the first reply: [\d.]+ d \(over 1 application\(s\)\)\.\n$/);
  });
});

describe('generate-tracker', () => {
  it('--json: file written', async () => {
    const j = parsed<{ ok: boolean; file: string; in_progress: number }>(await run('generate-tracker', '--json'));
    expect(j.ok).toBe(true);
    // Without --replace, next to the tracker: candidatures/_SUIVI.genere.md.
    expect(j.file).toMatch(/candidatures[\\/]_SUIVI\.genere\.md$/);
    expect(j.in_progress).toBe(2);
    expect(existsSync(j.file)).toBe(true);
  });

  it('text mode, --output, --replace', async () => {
    const out = `${tmp.root()}/tracker.md`;
    const r = await run('generate-tracker', '-o', out, '--replace');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/tracker\.md: 2 in progress, 0 sent without reply, 0 closed\.\n$/);
    expect(readFileSync(out, 'utf8')).toMatch(/^# Application tracking/);
  });
});

describe('French', () => {
  it('journal, deadlines and stats in French', async () => {
    const fr = `${tmp.root()}/fr`;
    const runFr = await workspace(fr, 'fr');
    cpSync(`${FIXTURES}/emails/indeed.eml`, `${fr}/emails/indeed.eml`);
    expect((await runFr('ingest', '--no-fetch', '--no-mail')).out).toContain('1 nouvelle');
    expect((await runFr('event', '1', '-t', 'note', '-r', 'Relire', '--at', '2026-11-05T09:15', '--done')).out).toContain('05/11/2026 09 h 15');
    expect((await runFr('journal', '1')).out).toContain('05/11/2026 09 h 15');
    expect((await runFr('deadlines')).out).toMatch(/^En retard \(0\)/);
    expect((await runFr('stats')).out).toContain('Envoyées : 0');
  });
});
