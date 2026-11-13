import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from '../src/db/database.ts';
import { importHistory, scoresOfCell, type ReportImport } from '../src/import/history.ts';
import { cells, split } from '../src/import/markdown.ts';
import { detailOffer, saveApplication, saveOffer, updateTags, offerById, findOffer } from '../src/core/offers.ts';
import { fingerprint } from '../src/core/text.ts';

const DATA = join(import.meta.dirname, 'fixtures', 'data');

describe('outils Markdown', () => {
  it('cellules et découpage hors liens', () => {
    expect(cells('| a | b \\| c | [x](u) |')).toEqual(['a', 'b | c', '[x](u)']);
    expect(split('A ([offre](u1)) · B ( ([offre](u2)) · C', ' · ')).toEqual(['A ([offre](u1))', 'B ( ([offre](u2))', 'C']);
  });
  it('notes d’une cellule', () => {
    expect(scoresOfCell('6/10')).toEqual([6]);
    expect(scoresOfCell('6 et 5,5/10')).toEqual([6, 5.5]);
    expect(scoresOfCell('7 · 6,5 · 4')).toEqual([7, 6.5, 4]);
    expect(scoresOfCell('4 à 7/10')).toEqual([]);
    expect(scoresOfCell('≤ 2,5/10')).toEqual([]);
    expect(scoresOfCell('—')).toEqual([]);
  });
});

describe('reprise de l’historique', () => {
  let db: Database;
  let r: ReportImport;
  beforeAll(() => {
    db = openDatabase(':memory:');
    r = importHistory(db, DATA);
  });

  it('lots : offres et notes complètes', () => {
    expect(r.batches).toMatchObject({ files: 1, inputs: 2, offers_created: 2, scores_added: 2 });
    const o = findOffer(db, 'hellowork', '80000050')!;
    expect(o).toMatchObject({ company: 'Omicron', score: 3, status: 'scored', published_at: '2026-10-28', compensation_max: 48000 });
  });

  it('registre : lignes groupées, entreprises et notes réparties, doublons', () => {
    // Le lot a déjà noté 4200000002 (6,5) : la note du registre (7) ne s'ajoute pas.
    const beta = findOffer(db, 'linkedin', '4200000002')!;
    expect(beta).toMatchObject({ score: 6.5, status: 'withdrawn', company: 'Bêta' });
    expect(findOffer(db, 'linkedin', '4200000003')).toMatchObject({ score: 7, company: 'Bêta' });
    expect(findOffer(db, 'hellowork', '80000001')).toMatchObject({ score: 6.5, company: 'Gamma (filiale)', title: 'Intégrateur WordPress' });
    expect(findOffer(db, 'indeed', '00aa11bb22cc33dd')).toMatchObject({ score: 4, company: 'Delta', remote: 'full remote' });
    // Ligne de lot : « Entreprise — Intitulé », note ambiguë (4 à 7) non reprise.
    expect(findOffer(db, 'glassdoor', '1010000000001')).toMatchObject({ company: 'Epsilon', title: 'Développeur PHP H/F', score: null, status: 'dismissed' });
    expect(findOffer(db, 'free-work', 'lead-dev-paris-3')).toMatchObject({ company: 'Zêta' });
    expect(findOffer(db, 'linkedin', '4200000005')).toMatchObject({ score: 5.5, compensation_min: 45000 });
    // Mise de côté : tag dédié.
    const alpha = detailOffer(db, findOffer(db, 'linkedin', '4200000001')!.id)!;
    expect(alpha.tags).toEqual(['a-reprendre']);
    expect(alpha.statuses[0].comment).toContain('mise de côté');
  });

  it('registre : lignes sans lien, liens et lignes non reconnus', () => {
    expect(r.register.lines).toBe(9);
    expect(r.register.offers_without_link).toBe(2); // Thêta (aucun lien) et Iota (lien non reconnu)
    expect(r.register.links_not_recognized.map((l) => l.url)).toEqual([
      'https://www.welcometothejungle.com/fr/companies/iota/jobs/webmaster',
    ]);
    expect(r.register.unrecognized).toHaveLength(1);
    expect(r.register.unrecognized[0].excerpt).toContain('Kappa');
  });

  it('suivi : statuts, candidatures et lien vers le dossier', () => {
    const acme = findOffer(db, 'linkedin', '4200000099')!; // URL trouvée dans le dossier de candidature
    const d = detailOffer(db, acme.id)!;
    expect(d).toMatchObject({ status: 'sent', score: 6, company: 'ACME' });
    expect(d.application).toMatchObject({ folder: 'candidatures/acme-developpeur-php', channel: 'LinkedIn', sent_at: '2026-10-20' });
    expect(findOffer(db, 'tracker', 'suivi-lambda-integrateur-api')).toMatchObject({ status: 'go', score: 5.5 });
    expect(r.tracker.lines).toBe(7);
    const statuses = (db.prepare("SELECT company, status FROM offers WHERE origin = 'import-tracker' ORDER BY company").all() as {
      company: string;
      status: string;
    }[]).map((x) => `${x.company}:${x.status}`);
    expect(statuses).toEqual(['ACME:sent', 'Lambda:go', 'Mu:followed-up', 'Nu:rejected', 'Pi:sent', 'Xi:withdrawn']);
  });

  it('idempotent : une deuxième reprise n’ajoute rien', () => {
    const before = db.prepare('SELECT (SELECT COUNT(*) FROM offers) o, (SELECT COUNT(*) FROM scores) n, (SELECT COUNT(*) FROM statuses) s').get();
    const r2 = importHistory(db, DATA);
    const after = db.prepare('SELECT (SELECT COUNT(*) FROM offers) o, (SELECT COUNT(*) FROM scores) n, (SELECT COUNT(*) FROM statuses) s').get();
    expect(after).toEqual(before);
    expect(r2.batches.offers_created + r2.register.offers_created + r2.tracker.offers_created).toBe(0);
    expect(r2.register.statuses_added + r2.tracker.statuses_added).toBe(0);
  });
});

describe('reprise : corrections du sprint 2', () => {
  let db: Database;
  let r: ReportImport;
  beforeAll(() => {
    db = openDatabase(':memory:');
    r = importHistory(db, DATA);
  });

  it('entreprises groupées : réparties par lien, « (×2) » compté deux fois', () => {
    expect(findOffer(db, 'linkedin', '4200000010')).toMatchObject({ company: 'Omega' });
    expect(findOffer(db, 'linkedin', '4200000011')).toMatchObject({ company: 'Omega' });
    expect(findOffer(db, 'linkedin', '4200000012')).toMatchObject({ company: 'Psi' });
    // Nombre d'entreprises ≠ nombre de liens : la cellule entière est gardée.
    expect(findOffer(db, 'linkedin', '4200000013')).toMatchObject({ company: 'Rho / Sigma / Tau' });
    // Séparées seulement par le gras : une par segment.
    expect(findOffer(db, 'linkedin', '4200000015')).toMatchObject({ company: 'Upsilon', score: 2 });
    expect(findOffer(db, 'linkedin', '4200000016')).toMatchObject({ company: 'Phi', score: 3 });
  });

  it('entreprises groupées : une reprise corrige les offres existantes', () => {
    const o = findOffer(db, 'linkedin', '4200000012')!;
    db.prepare('UPDATE offers SET company = ? WHERE id = ?').run('Omega (×2) / Psi', o.id);
    const r2 = importHistory(db, DATA);
    expect(r2.register.companies_corrected).toBe(1);
    expect(findOffer(db, 'linkedin', '4200000012')).toMatchObject({ company: 'Psi' });
  });

  it('suivi sans lien rattaché à l’offre du registre (même entreprise, intitulé voisin)', () => {
    const theta = db.prepare("SELECT * FROM offers WHERE company = 'Thêta'").all() as { id: number; source: string }[];
    expect(theta).toHaveLength(1);
    expect(theta[0].source).toBe('register');
    const d = detailOffer(db, theta[0].id)!;
    expect(d.status).toBe('closed');
    expect(d.application).toMatchObject({ label: 'Thêta — Support L2', state: 'Archivée, hors axe' });
  });

  it('doublon suivi / registre d’une reprise précédente : fusionné', () => {
    const label = 'Thêta — Support L2';
    const { offer } = saveOffer(db, 'tracker', `suivi-${fingerprint(label)}`, { title: 'Support L2', company: 'Thêta' }, 'import-tracker');
    updateTags(db, offer.id, ['duplicate-test'], []);
    const r2 = importHistory(db, DATA);
    expect(r2.tracker.merges).toHaveLength(1);
    expect(offerById(db, offer.id)).toBeUndefined();
    const rest = offerById(db, r2.tracker.merges[0].offer)!;
    expect(rest.source).toBe('register');
    expect(detailOffer(db, rest.id)!.tags).toContain('duplicate-test');
  });

  it('suivi : prochaine action, conditions, libellé et envoi approximatif repris', () => {
    const acme = detailOffer(db, findOffer(db, 'linkedin', '4200000099')!.id)!;
    expect(acme.application).toMatchObject({
      next_action: 'Relancer',
      next_action_origin: 'import-tracker',
      conditions: 'CDI Paris, télétravail partiel, 45-55 K€',
      label: '**ACME** — Développeur PHP senior',
      state: 'Envoyée — GO (6/10)',
    });
    const pi = db.prepare("SELECT c.* FROM applications c JOIN offers o ON o.id = c.offer_id WHERE o.company = 'Pi'").get();
    expect(pi).toMatchObject({ sent_at: '≈ 25/08/2026', folder: null });
  });

  it('suivi : une prochaine action saisie ailleurs n’est pas écrasée par la reprise', () => {
    const id = findOffer(db, 'linkedin', '4200000099')!.id;
    saveApplication(db, id, { next_action: 'Appeler mardi' }, { origin: 'interface' });
    importHistory(db, DATA);
    expect(detailOffer(db, id)!.application).toMatchObject({ next_action: 'Appeler mardi', next_action_origin: 'interface' });
  });

  it('idempotent avec les corrections', () => {
    const count = () =>
      db.prepare('SELECT (SELECT COUNT(*) FROM offers) o, (SELECT COUNT(*) FROM scores) n, (SELECT COUNT(*) FROM statuses) s, (SELECT COUNT(*) FROM applications) c').get();
    const before = count();
    const r2 = importHistory(db, DATA);
    expect(count()).toEqual(before);
    expect(r2.tracker.merges).toHaveLength(0);
    expect(r2.register.companies_corrected).toBe(0);
    expect(r.tracker.merges).toHaveLength(0);
  });
});
