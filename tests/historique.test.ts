import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ouvrirBase, type Base } from '../src/db/base.ts';
import { importerHistorique, notesDeCellule, type RapportImport } from '../src/import/historique.ts';
import { cellules, decouper } from '../src/import/markdown.ts';
import { detailOffre, enregistrerCandidature, enregistrerOffre, modifierTags, offreParId, trouverOffre } from '../src/core/offres.ts';
import { empreinte } from '../src/core/texte.ts';

const DONNEES = join(import.meta.dirname, 'fixtures', 'donnees');

describe('outils Markdown', () => {
  it('cellules et découpage hors liens', () => {
    expect(cellules('| a | b \\| c | [x](u) |')).toEqual(['a', 'b | c', '[x](u)']);
    expect(decouper('A ([offre](u1)) · B ( ([offre](u2)) · C', ' · ')).toEqual(['A ([offre](u1))', 'B ( ([offre](u2))', 'C']);
  });
  it('notes d’une cellule', () => {
    expect(notesDeCellule('6/10')).toEqual([6]);
    expect(notesDeCellule('6 et 5,5/10')).toEqual([6, 5.5]);
    expect(notesDeCellule('7 · 6,5 · 4')).toEqual([7, 6.5, 4]);
    expect(notesDeCellule('4 à 7/10')).toEqual([]);
    expect(notesDeCellule('≤ 2,5/10')).toEqual([]);
    expect(notesDeCellule('—')).toEqual([]);
  });
});

describe('reprise de l’historique', () => {
  let db: Base;
  let r: RapportImport;
  beforeAll(() => {
    db = ouvrirBase(':memory:');
    r = importerHistorique(db, DONNEES);
  });

  it('lots : offres et notes complètes', () => {
    expect(r.lots).toMatchObject({ fichiers: 1, entrees: 2, offres_creees: 2, notes_ajoutees: 2 });
    const o = trouverOffre(db, 'hellowork', '80000050')!;
    expect(o).toMatchObject({ entreprise: 'Omicron', note: 3, statut: 'notee', publiee_le: '2026-10-28', remuneration_max: 48000 });
  });

  it('registre : lignes groupées, entreprises et notes réparties, doublons', () => {
    // Le lot a déjà noté 4200000002 (6,5) : la note du registre (7) ne s'ajoute pas.
    const beta = trouverOffre(db, 'linkedin', '4200000002')!;
    expect(beta).toMatchObject({ note: 6.5, statut: 'abandonnee', entreprise: 'Bêta' });
    expect(trouverOffre(db, 'linkedin', '4200000003')).toMatchObject({ note: 7, entreprise: 'Bêta' });
    expect(trouverOffre(db, 'hellowork', '80000001')).toMatchObject({ note: 6.5, entreprise: 'Gamma (filiale)', titre: 'Intégrateur WordPress' });
    expect(trouverOffre(db, 'indeed', '00aa11bb22cc33dd')).toMatchObject({ note: 4, entreprise: 'Delta', teletravail: 'full remote' });
    // Ligne de lot : « Entreprise — Intitulé », note ambiguë (4 à 7) non reprise.
    expect(trouverOffre(db, 'glassdoor', '1010000000001')).toMatchObject({ entreprise: 'Epsilon', titre: 'Développeur PHP H/F', note: null, statut: 'ecartee' });
    expect(trouverOffre(db, 'free-work', 'lead-dev-paris-3')).toMatchObject({ entreprise: 'Zêta' });
    expect(trouverOffre(db, 'linkedin', '4200000005')).toMatchObject({ note: 5.5, remuneration_min: 45000 });
    // Mise de côté : tag dédié.
    const alpha = detailOffre(db, trouverOffre(db, 'linkedin', '4200000001')!.id)!;
    expect(alpha.tags).toEqual(['a-reprendre']);
    expect(alpha.statuts[0].commentaire).toContain('mise de côté');
  });

  it('registre : lignes sans lien, liens et lignes non reconnus', () => {
    expect(r.registre.lignes).toBe(9);
    expect(r.registre.offres_sans_lien).toBe(2); // Thêta (aucun lien) et Iota (lien non reconnu)
    expect(r.registre.liens_non_reconnus.map((l) => l.url)).toEqual([
      'https://www.welcometothejungle.com/fr/companies/iota/jobs/webmaster',
    ]);
    expect(r.registre.non_reconnues).toHaveLength(1);
    expect(r.registre.non_reconnues[0].extrait).toContain('Kappa');
  });

  it('suivi : statuts, candidatures et lien vers le dossier', () => {
    const acme = trouverOffre(db, 'linkedin', '4200000099')!; // URL trouvée dans le dossier de candidature
    const d = detailOffre(db, acme.id)!;
    expect(d).toMatchObject({ statut: 'envoyee', note: 6, entreprise: 'ACME' });
    expect(d.candidature).toMatchObject({ dossier: 'candidatures/acme-developpeur-php', canal: 'LinkedIn', envoyee_le: '2026-10-20' });
    expect(trouverOffre(db, 'suivi', 'suivi-lambda-integrateur-api')).toMatchObject({ statut: 'go', note: 5.5 });
    expect(r.suivi.lignes).toBe(7);
    const statuts = (db.prepare("SELECT entreprise, statut FROM offres WHERE origine = 'import-suivi' ORDER BY entreprise").all() as {
      entreprise: string;
      statut: string;
    }[]).map((x) => `${x.entreprise}:${x.statut}`);
    expect(statuts).toEqual(['ACME:envoyee', 'Lambda:go', 'Mu:relancee', 'Nu:refus', 'Pi:envoyee', 'Xi:abandonnee']);
  });

  it('idempotent : une deuxième reprise n’ajoute rien', () => {
    const avant = db.prepare('SELECT (SELECT COUNT(*) FROM offres) o, (SELECT COUNT(*) FROM notes) n, (SELECT COUNT(*) FROM statuts) s').get();
    const r2 = importerHistorique(db, DONNEES);
    const apres = db.prepare('SELECT (SELECT COUNT(*) FROM offres) o, (SELECT COUNT(*) FROM notes) n, (SELECT COUNT(*) FROM statuts) s').get();
    expect(apres).toEqual(avant);
    expect(r2.lots.offres_creees + r2.registre.offres_creees + r2.suivi.offres_creees).toBe(0);
    expect(r2.registre.statuts_ajoutes + r2.suivi.statuts_ajoutes).toBe(0);
  });
});

describe('reprise : corrections du sprint 2', () => {
  let db: Base;
  let r: RapportImport;
  beforeAll(() => {
    db = ouvrirBase(':memory:');
    r = importerHistorique(db, DONNEES);
  });

  it('entreprises groupées : réparties par lien, « (×2) » compté deux fois', () => {
    expect(trouverOffre(db, 'linkedin', '4200000010')).toMatchObject({ entreprise: 'Omega' });
    expect(trouverOffre(db, 'linkedin', '4200000011')).toMatchObject({ entreprise: 'Omega' });
    expect(trouverOffre(db, 'linkedin', '4200000012')).toMatchObject({ entreprise: 'Psi' });
    // Nombre d'entreprises ≠ nombre de liens : la cellule entière est gardée.
    expect(trouverOffre(db, 'linkedin', '4200000013')).toMatchObject({ entreprise: 'Rho / Sigma / Tau' });
    // Séparées seulement par le gras : une par segment.
    expect(trouverOffre(db, 'linkedin', '4200000015')).toMatchObject({ entreprise: 'Upsilon', note: 2 });
    expect(trouverOffre(db, 'linkedin', '4200000016')).toMatchObject({ entreprise: 'Phi', note: 3 });
  });

  it('entreprises groupées : une reprise corrige les offres existantes', () => {
    const o = trouverOffre(db, 'linkedin', '4200000012')!;
    db.prepare('UPDATE offres SET entreprise = ? WHERE id = ?').run('Omega (×2) / Psi', o.id);
    const r2 = importerHistorique(db, DONNEES);
    expect(r2.registre.entreprises_corrigees).toBe(1);
    expect(trouverOffre(db, 'linkedin', '4200000012')).toMatchObject({ entreprise: 'Psi' });
  });

  it('suivi sans lien rattaché à l’offre du registre (même entreprise, intitulé voisin)', () => {
    const theta = db.prepare("SELECT * FROM offres WHERE entreprise = 'Thêta'").all() as { id: number; source: string }[];
    expect(theta).toHaveLength(1);
    expect(theta[0].source).toBe('registre');
    const d = detailOffre(db, theta[0].id)!;
    expect(d.statut).toBe('close');
    expect(d.candidature).toMatchObject({ libelle: 'Thêta — Support L2', etat: 'Archivée, hors axe' });
  });

  it('doublon suivi / registre d’une reprise précédente : fusionné', () => {
    const libelle = 'Thêta — Support L2';
    const { offre } = enregistrerOffre(db, 'suivi', `suivi-${empreinte(libelle)}`, { titre: 'Support L2', entreprise: 'Thêta' }, 'import-suivi');
    modifierTags(db, offre.id, ['doublon-test'], []);
    const r2 = importerHistorique(db, DONNEES);
    expect(r2.suivi.fusions).toHaveLength(1);
    expect(offreParId(db, offre.id)).toBeUndefined();
    const reste = offreParId(db, r2.suivi.fusions[0].offre)!;
    expect(reste.source).toBe('registre');
    expect(detailOffre(db, reste.id)!.tags).toContain('doublon-test');
  });

  it('suivi : prochaine action, conditions, libellé et envoi approximatif repris', () => {
    const acme = detailOffre(db, trouverOffre(db, 'linkedin', '4200000099')!.id)!;
    expect(acme.candidature).toMatchObject({
      prochaine_action: 'Relancer',
      prochaine_action_origine: 'import-suivi',
      conditions: 'CDI Paris, télétravail partiel, 45-55 K€',
      libelle: '**ACME** — Développeur PHP senior',
      etat: 'Envoyée — GO (6/10)',
    });
    const pi = db.prepare("SELECT c.* FROM candidatures c JOIN offres o ON o.id = c.offre_id WHERE o.entreprise = 'Pi'").get();
    expect(pi).toMatchObject({ envoyee_le: '≈ 25/08/2026', dossier: null });
  });

  it('suivi : une prochaine action saisie ailleurs n’est pas écrasée par la reprise', () => {
    const id = trouverOffre(db, 'linkedin', '4200000099')!.id;
    enregistrerCandidature(db, id, { prochaine_action: 'Appeler mardi' }, { origine: 'interface' });
    importerHistorique(db, DONNEES);
    expect(detailOffre(db, id)!.candidature).toMatchObject({ prochaine_action: 'Appeler mardi', prochaine_action_origine: 'interface' });
  });

  it('idempotent avec les corrections', () => {
    const compte = () =>
      db.prepare('SELECT (SELECT COUNT(*) FROM offres) o, (SELECT COUNT(*) FROM notes) n, (SELECT COUNT(*) FROM statuts) s, (SELECT COUNT(*) FROM candidatures) c').get();
    const avant = compte();
    const r2 = importerHistorique(db, DONNEES);
    expect(compte()).toEqual(avant);
    expect(r2.suivi.fusions).toHaveLength(0);
    expect(r2.registre.entreprises_corrigees).toBe(0);
    expect(r.suivi.fusions).toHaveLength(0);
  });
});
