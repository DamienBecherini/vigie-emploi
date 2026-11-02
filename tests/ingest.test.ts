import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ouvrirBase, type Base } from '../src/db/base.ts';
import { lireEmail } from '../src/ingest/eml.ts';
import { ingerer } from '../src/ingest/ingest.ts';
import { extraireJsonLd } from '../src/ingest/jsonld.ts';
import { detailOffre, trouverOffre } from '../src/core/offres.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const EMAILS = join(FIXTURES, 'emails');
const lire = (f: string) => readFileSync(join(EMAILS, f));

describe('lecture des .eml', () => {
  it('LinkedIn : quoted-printable, titres, doublons fusionnés, liens génériques ignorés', async () => {
    const e = await lireEmail(lire('linkedin.eml'));
    expect(e.sujet).toBe('Développeur PHP : 3 nouvelles offres');
    expect(e.date).toBe('2026-11-02');
    expect(e.offres.map((o) => [o.idSite, o.titre])).toEqual([
      ['4100000001', 'Développeur PHP / WordPress senior'],
      ['4100000002', 'Ingénieur backend API & intégration'],
      ['4100000003', 'Développeur Java Spring'],
    ]);
  });
  it('Indeed : corps en base64, jk lu dans la charge utile gzip', async () => {
    const e = await lireEmail(lire('indeed.eml'));
    expect(e.offres).toHaveLength(1);
    expect(e.offres[0]).toMatchObject({ source: 'indeed', idSite: '0a1b2c3d4e5f6789', titre: 'Développeur·se web full stack' });
  });
  it('Hellowork : multipart, iso-8859-1, entités, liens Mailjet', async () => {
    const e = await lireEmail(lire('hellowork.eml'));
    expect(e.offres.map((o) => [o.source, o.idSite, o.titre])).toEqual([
      ['hellowork', '70000001', 'Développeur WordPress H/F'],
      ['hellowork', '70000002', 'Stage développeur web H/F'],
    ]);
  });
  it('texte brut : Free-Work et Glassdoor', async () => {
    const e = await lireEmail(lire('texte-brut.eml'));
    expect(e.offres.map((o) => [o.source, o.idSite, o.titre])).toEqual([
      ['free-work', 'developpeur-php-freelance-7', 'Développeur PHP freelance'],
      ['glassdoor', '1009000000001', 'Intégrateur API'],
    ]);
  });
});

describe('JSON-LD', () => {
  it('extrait titre, entreprise, salaire, télétravail, description sans la présentation répétée', () => {
    const d = extraireJsonLd(readFileSync(join(FIXTURES, 'pages', 'hellowork-70000001.html'), 'utf8'));
    expect(d).toMatchObject({
      titre: 'Développeur WordPress H/F',
      entreprise: 'Pi Conseil',
      lieu: 'Melun',
      contrat: 'Temps plein, CDI',
      remuneration: '45000-55000 YEAR',
      teletravail: 'oui',
      publiee_le: '2026-10-29',
    });
    expect(d!.description).toContain('- Thèmes FSE');
    expect(d!.description).not.toContain('Bienvenue chez');
  });
});

describe('ingestion', () => {
  let dossier: string;
  let db: Base;
  const page = readFileSync(join(FIXTURES, 'pages', 'hellowork-70000001.html'), 'utf8');
  const telechargees: string[] = [];
  const telechargeur = async (url: string) => {
    telechargees.push(url);
    if (url.includes('70000001')) return page;
    throw new Error('HTTP 404');
  };

  beforeEach(() => {
    dossier = mkdtempSync(join(tmpdir(), 'cap-emploi-'));
    cpSync(EMAILS, join(dossier, 'emails'), { recursive: true });
    db = ouvrirBase(':memory:');
    telechargees.length = 0;
  });
  afterEach(() => {
    db.close();
    rmSync(dossier, { recursive: true, force: true });
  });

  it('ajoute, écarte, télécharge seulement Hellowork / Free-Work, puis supprime les .eml', async () => {
    const r = await ingerer(db, {
      dossierEmails: join(dossier, 'emails'),
      titresExclus: [/\bjava\b(?!script)|spring/i, /\bstage\b/i],
      telechargeur,
    });
    expect(r.fichiers).toBe(4);
    expect(r.offres_trouvees).toBe(8);
    expect(r.ecartees).toBe(2);
    expect(r.nouvelles).toBe(6);
    expect(r.avec_description).toBe(1);
    expect(r.a_lire).toBe(5);
    expect(r.doublons).toBe(0);
    expect(telechargees.every((u) => /hellowork|free-work/.test(u))).toBe(true);
    expect(readdirSync(join(dossier, 'emails'))).toEqual([]);

    const hw = trouverOffre(db, 'hellowork', '70000001')!;
    expect(hw).toMatchObject({ entreprise: 'Pi Conseil', remuneration_min: 45000, statut: 'nouvelle', recue_le: '2026-10-31' });
    const java = trouverOffre(db, 'linkedin', '4100000003')!;
    expect(java.statut).toBe('ecartee');
    expect(detailOffre(db, java.id)!.statuts[0].commentaire).toBe('intitulé exclu : Java');
  });

  it('--keep garde les e-mails ; une deuxième passe ne trouve que des doublons', async () => {
    const o = { dossierEmails: join(dossier, 'emails'), garder: true, telecharger: false };
    const r1 = await ingerer(db, o);
    expect(r1.nouvelles).toBe(8);
    expect(existsSync(join(dossier, 'emails', 'linkedin.eml'))).toBe(true);
    const r2 = await ingerer(db, o);
    expect(r2.nouvelles).toBe(0);
    expect(r2.doublons).toBe(8);
  });
});
