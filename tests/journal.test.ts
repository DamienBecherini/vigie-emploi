import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from '../src/db/database.ts';
import { addStatus, detailOffer, saveApplication, saveOffer, offerById, findOffer } from '../src/core/offers.ts';
import { addEvent, pathRelative, deadlines, isFuture, journal, readDateEvent, markDone, updateEvent, nextDeadline, deleteEvent } from '../src/core/events.ts';
import { filesFolder, safeFile } from '../src/core/files.ts';
import { statistics } from '../src/core/statistics.ts';
import { scoreInput } from '../src/core/scoring.ts';
import { importHistory } from '../src/import/history.ts';
import { guessType, trackerLines } from '../src/import/journal.ts';
import { generateTracker } from '../src/export/tracker.ts';
import { ingest } from '../src/ingest/ingest.ts';
import { createApp } from '../src/api/server.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const DATA = join(FIXTURES, 'data');
/** The tests' "now": Monday 02/11/2026, 10:00 (local time). */
const NOW = new Date(2026, 10, 2, 10, 0);

function offer(db: Database, siteId: string, company = 'Kappa'): number {
  return saveOffer(db, 'linkedin', siteId, { title: 'Développeur API', company }, 'manual').offer.id;
}

describe('event dates', () => {
  it('accepted formats, normalized to YYYY-MM-DD[THH:MM]', () => {
    expect(readDateEvent('05/11/2026', NOW)).toBe('2026-11-05');
    expect(readDateEvent('5/11/2026 14:30', NOW)).toBe('2026-11-05T14:30');
    expect(readDateEvent('05/11/2026 à 9 h 05', NOW)).toBe('2026-11-05T09:05');
    expect(readDateEvent('2026-11-05T14:30:00Z', NOW)).toBe('2026-11-05T14:30');
    expect(readDateEvent('demain', NOW)).toBe('2026-11-03');
    expect(readDateEvent('+7', NOW)).toBe('2026-11-09');
    expect(() => readDateEvent('31/02/2026', NOW)).toThrow(/invalide/);
    expect(() => readDateEvent('bientôt', NOW)).toThrow(/invalide/);
  });
  it('future: a date alone of today is not, an hour later today is', () => {
    expect(isFuture('2026-11-02', NOW)).toBe(false);
    expect(isFuture('2026-11-02T15:00', NOW)).toBe(true);
    expect(isFuture('2026-11-03', NOW)).toBe(true);
  });
  it('file paths: relative, without traversal', () => {
    expect(pathRelative('candidatures\\x\\devis.md')).toBe('candidatures/x/devis.md');
    expect(() => pathRelative('../secret.txt')).toThrow(/refusé/);
    expect(() => pathRelative('candidatures/../../x')).toThrow(/refusé/);
    expect(() => pathRelative('C:/Windows/win.ini')).toThrow(/absolu/);
    expect(() => pathRelative('/etc/passwd')).toThrow(/absolu/);
    expect(() => pathRelative('.git/config')).toThrow(/refusé/);
  });
});

describe('journal and deadlines', () => {
  let db: Database;
  let id: number;
  beforeAll(() => {
    db = openDatabase(':memory:');
    id = offer(db, '4300000001');
  });

  it('a past event is done, a future one is a deadline; ordered journal', () => {
    const passed = addEvent(db, id, { type: 'message', direction: 'envoyé', at: '28/10/2026', summary: 'Candidature envoyée' }, 'cli', { now: NOW });
    expect(passed).toMatchObject({ done: true, direction: 'sent', at: '2026-10-28', files: [], origin: 'cli' });
    const overdue = addEvent(db, id, { type: 'message', at: '01/11/2026', summary: 'Relancer', done: false }, 'cli', { now: NOW });
    const future = addEvent(db, id, { type: 'interview', at: '05/11/2026 14:00', summary: 'Entretien technique', channel: 'Teams' }, 'mcp', { now: NOW });
    expect(future.done).toBe(false);
    const quote = addEvent(
      db,
      id,
      { type: 'proposal', at: '30/10/2026', summary: 'Devis', amount: '3 000', unit: '€ HT', days: '6', files: ['candidatures/kappa/devis.md'] },
      'interface',
      { now: NOW },
    );
    expect(quote).toMatchObject({ amount: 3000, unit: '€ HT', days: 6, files: ['candidatures/kappa/devis.md'] });

    const j = journal(db, id, NOW);
    expect(j.map((e) => e.id)).toEqual([overdue.id, future.id, quote.id, passed.id]);
    expect(j[0]).toMatchObject({ deadline: true, overdue: true });
    expect(j[1]).toMatchObject({ deadline: true, overdue: false });
    expect(j[2]).toMatchObject({ deadline: false, overdue: false });
  });

  it('deadlines over N days + overdue; mark done, update, delete', () => {
    const other = offer(db, '4300000002', 'Lambda');
    addEvent(db, other, { type: 'note', at: '20/11/2026', summary: 'Loin', done: false }, 'cli', { now: NOW });
    const r = deadlines(db, { days: 7, now: NOW });
    expect(r.overdue.map((e) => e.summary)).toEqual(['Relancer']);
    expect(r.upcoming.map((e) => [e.summary, e.company])).toEqual([['Entretien technique', 'Kappa']]);
    expect(deadlines(db, { days: 30, now: NOW }).upcoming).toHaveLength(2);

    const followUp = r.overdue[0];
    expect(nextDeadline(db, id)!.id).toBe(followUp.id);
    expect(markDone(db, followUp.id).done).toBe(true);
    expect(deadlines(db, { now: NOW }).overdue).toHaveLength(0);
    expect(nextDeadline(db, id)!.summary).toBe('Entretien technique');

    const m = updateEvent(db, followUp.id, { summary: 'Relance envoyée', channel: '', details: 'Par e-mail' });
    expect(m).toMatchObject({ summary: 'Relance envoyée', channel: null, details: 'Par e-mail' });
    expect(m.updated_at).toBeTruthy();
    expect(() => updateEvent(db, followUp.id, { summary: ' ' })).toThrow(/Résumé/);
    expect(() => addEvent(db, id, { type: 'call', summary: 'x' }, 'cli')).toThrow(/Type d'événement inconnu/);
    expect(() => addEvent(db, 9999, { type: 'note', summary: 'x' }, 'cli')).toThrow(/introuvable/);
    expect(() => addEvent(db, id, { type: 'note', summary: 'x', files: ['../x'] }, 'cli')).toThrow(/refusé/);
    deleteEvent(db, followUp.id);
    expect(detailOffer(db, id)!.events.map((e) => e.summary)).not.toContain('Relance envoyée');
  });

  it('generated tracker: the next action comes from the next deadline, otherwise from the field', () => {
    addStatus(db, id, 'sent', { origin: 'cli' });
    saveApplication(db, id, { next_action: 'Attendre' });
    const line = () =>
      generateTracker(db, DATA, NOW)
        .markdown.split('\n')
        .find((l) => l.includes('**Kappa**'))!;
    expect(line()).toContain('| **05/11 14 h 00** : Entretien technique |');
    const e = nextDeadline(db, id)!;
    markDone(db, e.id);
    expect(line()).toContain('| Attendre |');
  });

  it('statistics: sent, replies, interviews, proposals, delay', () => {
    const db2 = openDatabase(':memory:');
    const a = offer(db2, '4300000010', 'A');
    const b = offer(db2, '4300000011', 'B');
    offer(db2, '4300000012', 'C'); // never sent
    saveApplication(db2, a, { sent_at: '2026-10-01' });
    saveApplication(db2, b, { sent_at: '2026-10-10' });
    addStatus(db2, a, 'sent');
    addStatus(db2, b, 'sent');
    addEvent(db2, a, { type: 'message', direction: 'received', at: '05/10/2026', summary: 'Réponse' }, 'cli', { now: NOW });
    addEvent(db2, a, { type: 'interview', at: '12/10/2026', summary: 'Entretien' }, 'cli', { now: NOW });
    addEvent(db2, a, { type: 'proposal', direction: 'received', at: '20/10/2026', summary: 'Offre' }, 'cli', { now: NOW });
    expect(statistics(db2)).toEqual({
      sent: 2,
      replies: 1,
      interviews: 1,
      proposals: 1,
      average_reply_days: 4,
      reply_sample_size: 1,
    });
  });
});

describe('import of the folder journals', () => {
  let db: Database;
  let acme: number;
  beforeAll(() => {
    db = openDatabase(':memory:');
    importHistory(db, DATA);
    acme = findOffer(db, 'linkedin', '4200000099')!.id;
  });

  it('table lines and dated checked boxes; guessed types, linked files', () => {
    const r = importHistory(db, DATA).journal; // second pass: nothing new
    expect(r).toMatchObject({ folders: 1, lines: 6, events_created: 0, events_existing: 6, events_removed: 0 });
    expect(r.untyped.map((n) => n.excerpt)).toEqual(['Fiche relue.']);
    expect(r.without_date.map((n) => n.excerpt)).toEqual(['Point fait sans date']);

    const j = journal(db, acme, NOW);
    expect(j.map((e) => [e.at, e.type, e.direction])).toEqual([
      ['2026-10-31', 'test', 'received'],
      ['2026-10-30', 'note', null],
      ['2026-10-29', 'proposal', 'sent'],
      ['2026-10-27', 'interview', null],
      ['2026-10-24', 'message', 'received'],
      ['2026-10-20', 'message', 'sent'],
    ]);
    expect(j.every((e) => e.done && e.origin === 'import')).toBe(true);
    const quote = j.find((e) => e.type === 'proposal')!;
    expect(quote).toMatchObject({ amount: 3000, unit: '€ HT', days: 6, files: ['candidatures/acme-developpeur-php/devis-2026-10-29.md'] });
    expect(j.find((e) => e.type === 'interview')!.files).toEqual(['candidatures/acme-developpeur-php/compte-rendu-appel.md']);
    expect(r.events_duplicate).toEqual([]);
  });

  it('a fact already entered by hand (same type, day, compatible direction) is not imported again', () => {
    const db2 = openDatabase(':memory:');
    importHistory(db2, DATA);
    const id = findOffer(db2, 'linkedin', '4200000099')!.id;
    const imported = journal(db2, id, NOW).find((e) => e.at === '2026-10-27' && e.type === 'interview')!;
    db2.prepare('DELETE FROM events WHERE id = ?').run(imported.id);
    addEvent(db2, id, { type: 'interview', at: '27/10/2026 14:00', summary: 'Entretien saisi à la main' }, 'mcp', { now: NOW });
    const r = importHistory(db2, DATA).journal;
    expect(r.events_created).toBe(0);
    expect(r.events_duplicate).toHaveLength(1);
    expect(
      journal(db2, id, NOW)
        .filter((e) => e.type === 'interview')
        .map((e) => e.origin),
    ).toEqual(['mcp']);
  });

  it('tracker formats: dated bullets, unchecked boxes ignored, code blocks ignored', () => {
    const { lines, withoutDate } = trackerLines(
      [
        '## 6. Suivi',
        '',
        '- 13/10/2026 — **Message envoyé** à Max (LinkedIn).',
        '- [x] Annonce relue (26/10)',
        '- [ ] Réponse : ______',
        '```text',
        '- 01/01/2026 — dans un bloc de code',
        '```',
        '## Autre',
        '- 14/10/2026 — hors section',
      ].join('\n'),
      2026,
    );
    expect(lines).toEqual([
      { number: 3, at: '2026-10-13', text: '**Message envoyé** à Max (LinkedIn).' },
      { number: 4, at: '2026-10-26', text: 'Annonce relue (26/10)' },
    ]);
    expect(withoutDate).toEqual([]);
    expect(guessType('Réponse le 14/10/2026 : **refus**, e-mail type').type).toBe('decision');
    expect(guessType('**E-mail de Zoé** : le directeur demande un entretien de 30 min')).toMatchObject({ type: 'message', direction: 'received' });
    expect(guessType('Candidature envoyée le : 12/10/2026 (e-mail, CV joint)')).toMatchObject({ type: 'message', direction: 'sent' });
    expect(guessType("14/10/2026 : proposition d'offre du conseiller France Travail").type).not.toBe('proposal');
  });

  it('folder files: list and access limited to the data folder', () => {
    const f = filesFolder(db, DATA, acme);
    expect(f.folder).toBe('candidatures/acme-developpeur-php');
    expect(f.files.map((x) => x.name)[0]).toBe('dossier-candidature.md');
    expect(f.files.map((x) => x.path)).toContain('candidatures/acme-developpeur-php/devis-2026-10-29.md');
    expect(safeFile(DATA, 'candidatures/_SUIVI.md').relative).toBe('candidatures/_SUIVI.md');
    expect(() => safeFile(DATA, 'candidatures/../../journal.test.ts')).toThrow(/refusé/);
    expect(() => safeFile(DATA, 'candidatures/absent.md')).toThrow(/introuvable/);
  });
});

describe('API: journal, deadlines, files', () => {
  const db = openDatabase(':memory:');
  importHistory(db, DATA);
  const app = createApp(db, { dataDir: DATA });
  const acme = findOffer(db, 'linkedin', '4200000099')!.id;
  const json = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('add, mark done, update, delete; deadlines', async () => {
    const r = await app.request(`/api/offers/${acme}/events`, json({ type: 'message', at: '+2', summary: 'Relancer Julie', direction: 'sent' }));
    expect(r.status).toBe(200);
    const d = (await r.json()) as { events: { id: number; summary: string; done: boolean }[] };
    const e = d.events[0];
    expect(e).toMatchObject({ summary: 'Relancer Julie', done: false });
    const ech = (await (await app.request('/api/deadlines?days=7')).json()) as { upcoming: { id: number }[] };
    expect(ech.upcoming.map((x) => x.id)).toContain(e.id);
    const done = (await (await app.request(`/api/events/${e.id}/done`, json({ done: true }))).json()) as typeof d;
    expect(done.events.find((x) => x.id === e.id)!.done).toBe(true);
    const change = await app.request(`/api/events/${e.id}`, { ...json({ summary: 'Relance faite' }), method: 'PUT' });
    expect(((await change.json()) as typeof d).events.some((x) => x.summary === 'Relance faite')).toBe(true);
    const error = await app.request(`/api/offers/${acme}/events`, json({ type: 'note', summary: '' }));
    expect(error.status).toBe(400);
    expect(((await error.json()) as { error: string }).error).toMatch(/Résumé/);
    const sup = await app.request(`/api/events/${e.id}`, { method: 'DELETE' });
    expect(((await sup.json()) as typeof d).events.some((x) => x.id === e.id)).toBe(false);
    expect((await app.request('/api/events/99999', { method: 'DELETE' })).status).toBe(404);
  });

  it('files: Markdown rendered without script, plain text, traversal refused', async () => {
    const list = (await (await app.request(`/api/offers/${acme}/files`)).json()) as { files: { path: string }[] };
    expect(list.files.length).toBe(3);
    const md = await app.request('/api/file/candidatures/acme-developpeur-php/compte-rendu-appel.md');
    expect(md.status).toBe(200);
    expect(md.headers.get('content-type')).toMatch(/text\/html/);
    expect(md.headers.get('content-security-policy')).toMatch(/default-src 'none'/);
    const html = await md.text();
    expect(html).toContain('<h1>Compte rendu (fictif)</h1>');
    expect(html).toContain('href="devis-2026-10-29.md"'); // relative link: stays inside the folder
    const raw = await app.request('/api/file/candidatures/acme-developpeur-php/compte-rendu-appel.md?raw=1');
    expect(raw.headers.get('content-type')).toMatch(/text\/plain/);
    for (const path of ['applications%2F..%2F..%2Fjournal.test.ts', 'data%2Fx.sqlite', '.git%2Fconfig', 'C%3A%2FWindows%2Fwin.ini']) {
      expect((await app.request(`/api/file/${path}`)).status, path).toBe(403);
    }
    expect((await app.request('/api/file/candidatures/absent.md')).status).toBe(404);
  });

  it('foreign host refused (DNS rebinding)', async () => {
    expect((await app.request('/api/health', { headers: { host: 'example.com' } })).status).toBe(403);
    expect((await app.request('/api/health', { headers: { host: 'localhost:4410' } })).status).toBe(200);
  });
});

describe('already tracked offer seen again in a batch, the register or an alert: status unchanged', () => {
  it('batch and register (imports) do not move an application back', () => {
    const db = openDatabase(':memory:');
    const id = offer(db, '4300000020');
    addStatus(db, id, 'sent', { origin: 'cli', at: '2026-10-20' });
    // Seen again later in a scored batch and in the register of dismissed offers.
    scoreInput(db, { id, score: 4 }, { origin: 'import-batch', at: '2026-11-02' });
    addStatus(db, id, 'dismissed', { origin: 'import-register', at: '2026-11-02', comment: 'Sans go' });
    addStatus(db, id, 'scored', { origin: 'import-batch', at: '2026-11-02' });
    expect(offerById(db, id)!.status).toBe('sent');
    // A decision of the user, on the other hand, is the reference.
    addStatus(db, id, 'dismissed', { origin: 'interface', at: '2026-11-03' });
    expect(offerById(db, id)!.status).toBe('dismissed');
  });

  it('full import: an offer of the tracker seen again in a batch keeps its application status', () => {
    const db = openDatabase(':memory:');
    importHistory(db, DATA);
    // ACME (sent in the tracker): replaying the import changes nothing.
    const acme = findOffer(db, 'linkedin', '4200000099')!;
    expect(acme.status).toBe('sent');
  });

  describe('ingest', () => {
    let folder: string;
    beforeAll(() => {
      folder = mkdtempSync(join(tmpdir(), 'vigie-emploi-revue-'));
    });
    afterAll(() => rmSync(folder, { recursive: true, force: true }));

    it('an alert that offers a sent offer again leaves its status and adds one trace per day', async () => {
      const db = openDatabase(':memory:');
      cpSync(join(FIXTURES, 'emails'), folder, { recursive: true });
      await ingest(db, { folderEmails: folder, keep: true, download: false });
      const o = findOffer(db, 'linkedin', '4100000001')!;
      addStatus(db, o.id, 'sent', { origin: 'cli' });
      const r = await ingest(db, { folderEmails: folder, keep: true, download: false });
      expect(r.added).toBe(0);
      expect(offerById(db, o.id)!.status).toBe('sent');
      await ingest(db, { folderEmails: folder, keep: true, download: false });
      const traces = journal(db, o.id).filter((e) => e.summary.startsWith('Revue le'));
      expect(traces).toHaveLength(1);
      expect(traces[0]).toMatchObject({ type: 'note', done: true, origin: 'import' });
      // An offer not tracked yet has no trace.
      expect(journal(db, findOffer(db, 'linkedin', '4100000002')!.id)).toHaveLength(0);
    });
  });
});
