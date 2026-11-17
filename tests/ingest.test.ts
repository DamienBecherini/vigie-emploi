import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from '../src/db/database.ts';
import { readEmail } from '../src/ingest/eml.ts';
import { ingest } from '../src/ingest/ingest.ts';
import { extractJsonLd } from '../src/ingest/jsonld.ts';
import { detailOffer, findOffer } from '../src/core/offers.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const EMAILS = join(FIXTURES, 'emails');
const read = (f: string) => readFileSync(join(EMAILS, f));

describe('reading of the .eml files', () => {
  it('LinkedIn: quoted-printable, titles, duplicates merged, generic links ignored', async () => {
    const e = await readEmail(read('linkedin.eml'));
    expect(e.subject).toBe('Développeur PHP : 3 nouvelles offres');
    expect(e.date).toBe('2026-11-02');
    expect(e.offers.map((o) => [o.siteId, o.title])).toEqual([
      ['4100000001', 'Développeur PHP / WordPress senior'],
      ['4100000002', 'Ingénieur backend API & intégration'],
      ['4100000003', 'Développeur Java Spring'],
    ]);
  });
  it('Indeed: base64 body, jk read in the gzip payload', async () => {
    const e = await readEmail(read('indeed.eml'));
    expect(e.offers).toHaveLength(1);
    expect(e.offers[0]).toMatchObject({ source: 'indeed', siteId: '0a1b2c3d4e5f6789', title: 'Développeur·se web full stack' });
  });
  it('Hellowork: multipart, iso-8859-1, entities, Mailjet links', async () => {
    const e = await readEmail(read('hellowork.eml'));
    expect(e.offers.map((o) => [o.source, o.siteId, o.title])).toEqual([
      ['hellowork', '70000001', 'Développeur WordPress H/F'],
      ['hellowork', '70000002', 'Stage développeur web H/F'],
    ]);
  });
  it('plain text: Free-Work and Glassdoor', async () => {
    const e = await readEmail(read('text-raw.eml'));
    expect(e.offers.map((o) => [o.source, o.siteId, o.title])).toEqual([
      ['free-work', 'developpeur-php-freelance-7', 'Développeur PHP freelance'],
      ['glassdoor', '1009000000001', 'Intégrateur API'],
    ]);
  });
});

describe('JSON-LD', () => {
  it('extracts title, company, salary, remote work, description without the repeated presentation', () => {
    const d = extractJsonLd(readFileSync(join(FIXTURES, 'pages', 'hellowork-70000001.html'), 'utf8'));
    expect(d).toMatchObject({
      title: 'Développeur WordPress H/F',
      company: 'Pi Conseil',
      location: 'Melun',
      contract: 'Temps plein, CDI',
      compensation: '45000-55000 YEAR',
      remote: 'oui',
      published_at: '2026-10-29',
    });
    expect(d!.description).toContain('- Thèmes FSE');
    expect(d!.description).not.toContain('Bienvenue chez');
  });
});

describe('ingestion', () => {
  let folder: string;
  let db: Database;
  const page = readFileSync(join(FIXTURES, 'pages', 'hellowork-70000001.html'), 'utf8');
  const downloaded: string[] = [];
  const downloader = async (url: string) => {
    downloaded.push(url);
    if (url.includes('70000001')) return page;
    throw new Error('HTTP 404');
  };

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'vigie-emploi-'));
    cpSync(EMAILS, join(folder, 'emails'), { recursive: true });
    db = openDatabase(':memory:');
    downloaded.length = 0;
  });
  afterEach(() => {
    db.close();
    rmSync(folder, { recursive: true, force: true });
  });

  it('an application acknowledgment does not create an offer', async () => {
    const emails = join(folder, 'emails');
    const raw = readFileSync(join(emails, 'indeed.eml'), 'utf8').replace(/^Subject: .*$/m, 'Subject: Confirmation de votre candidature Developpeur web');
    rmSync(emails, { recursive: true, force: true });
    mkdirSync(emails);
    writeFileSync(join(emails, 'confirmation.eml'), raw);
    const r = await ingest(db, { folderEmails: emails, downloader });
    expect(r.added).toBe(0);
    expect(r.confirmations).toHaveLength(1);
    expect(r.confirmations[0].subject).toMatch(/Confirmation de votre candidature/);
    expect(readdirSync(emails)).toEqual([]);
  });

  it('also deletes the e-mails whose names have brackets and ellipses (Windows)', async () => {
    const emails = join(folder, 'emails');
    renameSync(join(emails, 'linkedin.eml'), join(emails, '___Potentiel-SPAM___  [Prénom x Celad] Nouvelle opportunité ... - 2026-10-28 1330.eml'));
    const r = await ingest(db, { folderEmails: emails, downloader });
    expect(r.errors.filter((e) => /non supprimé/.test(e.message))).toEqual([]);
    expect(readdirSync(emails)).toEqual([]);
  });

  it('adds, dismisses, downloads only Hellowork / Free-Work, then deletes the .eml files', async () => {
    const r = await ingest(db, {
      folderEmails: join(folder, 'emails'),
      excludedTitles: [/\bjava\b(?!script)|spring/i, /\bstage\b/i],
      downloader,
    });
    expect(r.files).toBe(4);
    expect(r.offers_found).toBe(8);
    expect(r.dismissed).toBe(2);
    expect(r.added).toBe(6);
    expect(r.with_description).toBe(1);
    expect(r.to_read).toBe(5);
    expect(r.duplicates).toBe(0);
    expect(downloaded.every((u) => /hellowork|free-work/.test(u))).toBe(true);
    expect(readdirSync(join(folder, 'emails'))).toEqual([]);

    const hw = findOffer(db, 'hellowork', '70000001')!;
    expect(hw).toMatchObject({ company: 'Pi Conseil', compensation_min: 45000, status: 'new', received_at: '2026-10-31' });
    const java = findOffer(db, 'linkedin', '4100000003')!;
    expect(java.status).toBe('dismissed');
    expect(detailOffer(db, java.id)!.statuses[0].comment).toBe('intitulé exclu : Java');
  });

  it('keeps an e-mail in which no offer is recognized', async () => {
    writeFileSync(
      join(folder, 'emails', 'unknown.eml'),
      'From: Plateforme <contact@exemple.test>\r\nTo: moi@exemple.test\r\nSubject: Nouvelle opportunite\r\nDate: Mon, 3 Nov 2026 10:00:00 +0100\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nUne mission pourrait vous plaire.\r\n',
    );
    const r = await ingest(db, { folderEmails: join(folder, 'emails'), download: false });
    expect(r.without_offer).toEqual(['unknown.eml']);
    expect(r.files_deleted).toBe(4);
    expect(readdirSync(join(folder, 'emails'))).toEqual(['unknown.eml']);
  });

  it('--keep keeps the e-mails; a second pass only finds duplicates', async () => {
    const o = { folderEmails: join(folder, 'emails'), keep: true, download: false };
    const r1 = await ingest(db, o);
    expect(r1.added).toBe(8);
    expect(existsSync(join(folder, 'emails', 'linkedin.eml'))).toBe(true);
    const r2 = await ingest(db, o);
    expect(r2.added).toBe(0);
    expect(r2.duplicates).toBe(8);
  });
});
