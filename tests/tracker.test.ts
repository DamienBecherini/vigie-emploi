import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from '../src/db/database.ts';
import { importHistory } from '../src/import/history.ts';
import { addStatus, detailOffer, saveOffer, findOffer } from '../src/core/offers.ts';
import { prepareApplication, trackApplication } from '../src/core/actions.ts';
import { writeTracker, generateTracker } from '../src/export/tracker.ts';

const DATA = join(import.meta.dirname, 'fixtures', 'data');

/** Lines of a ## section of the generated Markdown. */
function section(md: string, title: string): string[] {
  const start = md.indexOf(`## ${title}`);
  const end = md.indexOf('\n## ', start + 3);
  return md
    .slice(start, end < 0 ? undefined : end)
    .split('\n')
    .filter((l) => l.startsWith('| ') && !l.startsWith('| Offre'));
}

describe('tracker generated from the database', () => {
  let db: Database;
  let md: string;
  beforeAll(() => {
    db = openDatabase(':memory:');
    importHistory(db, DATA);
    md = generateTracker(db, DATA, new Date('2026-11-02T09:30:00Z')).markdown;
  });

  it('“do not edit” header and sections', () => {
    expect(md).toContain('Fichier généré par vigie-emploi le 02/11/2026 à 10:30 : ne pas éditer à la main.');
    expect(md).toMatch(/## En cours[\s\S]*## Envoyées sans suite[\s\S]*## Closes/);
  });

  it('in progress: columns imported as they are, to send on top, links to the folders', () => {
    const lines = section(md, 'En cours');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('**Lambda** — Intégrateur API');
    expect(lines[0]).toContain('[lambda-integrateur-api](lambda-integrateur-api/)'); // folder missing: link to the folder
    expect(lines[1]).toBe(
      '| **ACME** — Développeur PHP senior | CDI Paris, télétravail partiel, 45-55 K€ | LinkedIn | 20/10/2026 | Envoyée — GO (6/10) | Relancer | [acme-developpeur-php](acme-developpeur-php/dossier-candidature.md) |',
    );
    expect(lines[2]).toContain('| **Mu** — Dév WordPress | CDI | E-mail | 10/10/2026 | Mail de relance envoyé le 28/10 | Attendre | — |');
  });

  it('sent without reply and closed', () => {
    expect(section(md, 'Envoyées sans suite')).toEqual(['| Pi — Intégrateur | — | — | ≈ 25/08/2026 | sans réponse connue | — | — |']);
    expect(md).toContain('Les dates « ≈ » sont des estimations');
    const closes = section(md, 'Closes');
    expect(closes).toContain('| Nu — Fullstack ([dossier](_archives/nu-fullstack/)) | Close le 14/10/2026 : refus reçu |');
    expect(closes).toContain('| Thêta — Support L2 | Archivée, hors axe |');
    expect(closes).toHaveLength(3);
  });

  it('after a status change, the Status column follows the database', () => {
    const mu = db.prepare("SELECT id FROM offers WHERE company = 'Mu'").get() as { id: number };
    addStatus(db, mu.id, 'interview', { comment: 'Entretien le 05/11 à 14 h', origin: 'interface' });
    const line = section(generateTracker(db, DATA).markdown, 'En cours').find((l) => l.includes('**Mu**'))!;
    expect(line).toContain('| Entretien le 05/11 à 14 h |');
  });

  it('an offer moved to go by “apply” appears, to send', () => {
    const { offer } = saveOffer(db, 'linkedin', '4299999999', { title: 'Développeur API', company: 'Sigma', contract: 'CDI' }, 'manual');
    prepareApplication(db, DATA, offer.id, 'mcp');
    trackApplication(db, offer.id, { next_action: 'Écrire le message', folder: 'candidatures/sigma-developpeur-api' }, 'mcp');
    const line = section(generateTracker(db, DATA).markdown, 'En cours')[0];
    expect(line).toBe(
      '| **Sigma** — Développeur API | CDI | — | — | **À envoyer** — GO | Écrire le message | [sigma-developpeur-api](sigma-developpeur-api/) |',
    );
  });
});

describe('apply: status', () => {
  it('reopens a withdrawn offer, does not move an application in progress back', () => {
    const db = openDatabase(':memory:');
    const { offer } = saveOffer(db, 'linkedin', '4277777777', { title: 'Dev', company: 'Upsilon' }, 'manual');
    addStatus(db, offer.id, 'withdrawn', { comment: 'abandon', origin: 'cli' });
    const r = prepareApplication(db, DATA, offer.id, 'cli');
    expect(r.offer.status).toBe('go');
    expect(r.offer.statuses[0].comment).toBe('apply (reprise après « withdrawn »)');
    addStatus(db, offer.id, 'interview', { comment: 'call', origin: 'cli' });
    expect(prepareApplication(db, DATA, offer.id, 'cli').offer.status).toBe('interview');
  });
});

describe('application: sending date and status', () => {
  it('a DD/MM/YYYY date is stored as ISO and moves the offer to “sent”', () => {
    const db = openDatabase(':memory:');
    const { offer } = saveOffer(db, 'linkedin', '4288888888', { title: 'Dev', company: 'Tau' }, 'manual');
    prepareApplication(db, DATA, offer.id, 'cli');
    const r = trackApplication(db, offer.id, { sent_at: '02/11/2026', channel: 'LinkedIn' }, 'cli');
    expect(r.status_added).toBe('sent');
    expect(r.offer.status).toBe('sent');
    expect(r.offer.application).toMatchObject({ sent_at: '2026-11-02', channel: 'LinkedIn' });
    expect(r.offer.statuses[0].comment).toBe('LinkedIn, envoyée le 02/11/2026');
    // Clearing a field: null or empty string.
    expect(trackApplication(db, offer.id, { channel: '' }, 'cli').offer.application!.channel).toBeNull();
    expect(() => trackApplication(db, 999, {}, 'cli')).toThrow('Offre 999 introuvable');
  });
});

describe('writing of the tracker', () => {
  let folder: string;
  beforeAll(() => {
    folder = mkdtempSync(join(tmpdir(), 'vigie-emploi-suivi-'));
    cpSync(DATA, folder, { recursive: true });
  });
  afterAll(() => rmSync(folder, { recursive: true, force: true }));

  it('preview by default, _SUIVI.md untouched; a generated tracker is not read again by the import', () => {
    const db = openDatabase(':memory:');
    importHistory(db, folder);
    const original = readFileSync(join(folder, 'candidatures', '_SUIVI.md'), 'utf8');
    const r = writeTracker(db, folder);
    expect(r.file).toBe(join(folder, 'candidatures', '_SUIVI.genere.md'));
    expect(readFileSync(join(folder, 'candidatures', '_SUIVI.md'), 'utf8')).toBe(original);
    expect(r).toMatchObject({ in_progress: 3, no_follow_up: 1, closes: 3 });

    const r2 = writeTracker(db, folder, { replace: true });
    expect(r2.file).toBe(join(folder, 'candidatures', '_SUIVI.md'));
    const db2 = openDatabase(':memory:');
    const report = importHistory(db2, folder);
    expect(report.tracker.ignore).toBeTruthy();
    expect(report.tracker.lines).toBe(0);
    writeFileSync(join(folder, 'candidatures', '_SUIVI.md'), original);
    expect(findOffer(db2, 'linkedin', '4200000099')).toBeUndefined();
    expect(detailOffer(db, findOffer(db, 'linkedin', '4200000099')!.id)!.application).toBeTruthy();
  });
});
