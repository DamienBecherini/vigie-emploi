import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ouvrirBase, type Base } from '../src/db/base.ts';
import { importerHistorique } from '../src/import/historique.ts';
import { ajouterStatut, detailOffre, enregistrerOffre, trouverOffre } from '../src/core/offres.ts';
import { preparerCandidature, suivreCandidature } from '../src/core/actions.ts';
import { ecrireSuivi, genererSuivi } from '../src/export/suivi.ts';

const DONNEES = join(import.meta.dirname, 'fixtures', 'donnees');

/** Lignes d'une section ## du Markdown généré. */
function section(md: string, titre: string): string[] {
  const debut = md.indexOf(`## ${titre}`);
  const fin = md.indexOf('\n## ', debut + 3);
  return md
    .slice(debut, fin < 0 ? undefined : fin)
    .split('\n')
    .filter((l) => l.startsWith('| ') && !l.startsWith('| Offre'));
}

describe('suivi généré depuis la base', () => {
  let db: Base;
  let md: string;
  beforeAll(() => {
    db = ouvrirBase(':memory:');
    importerHistorique(db, DONNEES);
    md = genererSuivi(db, DONNEES, new Date('2026-11-02T09:30:00Z')).markdown;
  });

  it('en-tête « ne pas éditer » et sections', () => {
    expect(md).toContain('Fichier généré par cap-emploi le 02/11/2026 à 10:30 : ne pas éditer à la main.');
    expect(md).toMatch(/## En cours[\s\S]*## Envoyées sans suite[\s\S]*## Closes/);
  });

  it('en cours : colonnes reprises telles quelles, à envoyer en tête, liens vers les dossiers', () => {
    const lignes = section(md, 'En cours');
    expect(lignes).toHaveLength(3);
    expect(lignes[0]).toContain('**Lambda** — Intégrateur API');
    expect(lignes[0]).toContain('[lambda-integrateur-api](lambda-integrateur-api/)'); // dossier absent : lien vers le dossier
    expect(lignes[1]).toBe(
      '| **ACME** — Développeur PHP senior | CDI Paris, télétravail partiel, 45-55 K€ | LinkedIn | 20/10/2026 | Envoyée — GO (6/10) | Relancer | [acme-developpeur-php](acme-developpeur-php/dossier-candidature.md) |',
    );
    expect(lignes[2]).toContain('| **Mu** — Dév WordPress | CDI | E-mail | 10/10/2026 | Mail de relance envoyé le 28/10 | Attendre | — |');
  });

  it('envoyées sans suite et closes', () => {
    expect(section(md, 'Envoyées sans suite')).toEqual(['| Pi — Intégrateur | — | — | ≈ 25/08/2026 | sans réponse connue | — | — |']);
    expect(md).toContain('Les dates « ≈ » sont des estimations');
    const closes = section(md, 'Closes');
    expect(closes).toContain('| Nu — Fullstack ([dossier](_archives/nu-fullstack/)) | Close le 14/10/2026 : refus reçu |');
    expect(closes).toContain('| Thêta — Support L2 | Archivée, hors axe |');
    expect(closes).toHaveLength(3);
  });

  it('après un changement de statut, la colonne Statut suit la base', () => {
    const mu = db.prepare("SELECT id FROM offres WHERE entreprise = 'Mu'").get() as { id: number };
    ajouterStatut(db, mu.id, 'entretien', { commentaire: 'Entretien le 05/11 à 14 h', origine: 'interface' });
    const ligne = section(genererSuivi(db, DONNEES).markdown, 'En cours').find((l) => l.includes('**Mu**'))!;
    expect(ligne).toContain('| Entretien le 05/11 à 14 h |');
  });

  it('une offre passée en go par « candidater » apparaît, à envoyer', () => {
    const { offre } = enregistrerOffre(db, 'linkedin', '4299999999', { titre: 'Développeur API', entreprise: 'Sigma', contrat: 'CDI' }, 'manuel');
    preparerCandidature(db, DONNEES, offre.id, 'mcp');
    suivreCandidature(db, offre.id, { prochaine_action: 'Écrire le message', dossier: 'candidatures/sigma-developpeur-api' }, 'mcp');
    const ligne = section(genererSuivi(db, DONNEES).markdown, 'En cours')[0];
    expect(ligne).toBe(
      '| **Sigma** — Développeur API | CDI | — | — | **À envoyer** — GO | Écrire le message | [sigma-developpeur-api](sigma-developpeur-api/) |',
    );
  });
});

describe('candidater : statut', () => {
  it('rouvre une offre abandonnée, ne fait pas reculer une candidature en cours', () => {
    const db = ouvrirBase(':memory:');
    const { offre } = enregistrerOffre(db, 'linkedin', '4277777777', { titre: 'Dev', entreprise: 'Upsilon' }, 'manuel');
    ajouterStatut(db, offre.id, 'abandonnee', { commentaire: 'abandon', origine: 'cli' });
    const r = preparerCandidature(db, DONNEES, offre.id, 'cli');
    expect(r.offre.statut).toBe('go');
    expect(r.offre.statuts[0].commentaire).toBe('candidater (reprise après « abandonnee »)');
    ajouterStatut(db, offre.id, 'entretien', { commentaire: 'appel', origine: 'cli' });
    expect(preparerCandidature(db, DONNEES, offre.id, 'cli').offre.statut).toBe('entretien');
  });
});

describe('candidature : date d’envoi et statut', () => {
  it('une date JJ/MM/AAAA est rangée en ISO et fait passer l’offre en « envoyee »', () => {
    const db = ouvrirBase(':memory:');
    const { offre } = enregistrerOffre(db, 'linkedin', '4288888888', { titre: 'Dev', entreprise: 'Tau' }, 'manuel');
    preparerCandidature(db, DONNEES, offre.id, 'cli');
    const r = suivreCandidature(db, offre.id, { envoyee_le: '02/11/2026', canal: 'LinkedIn' }, 'cli');
    expect(r.statut_ajoute).toBe('envoyee');
    expect(r.offre.statut).toBe('envoyee');
    expect(r.offre.candidature).toMatchObject({ envoyee_le: '2026-11-02', canal: 'LinkedIn' });
    expect(r.offre.statuts[0].commentaire).toBe('LinkedIn, envoyée le 02/11/2026');
    // Effacer un champ : null ou chaîne vide.
    expect(suivreCandidature(db, offre.id, { canal: '' }, 'cli').offre.candidature!.canal).toBeNull();
    expect(() => suivreCandidature(db, 999, {}, 'cli')).toThrow('Offre 999 introuvable');
  });
});

describe('écriture du suivi', () => {
  let dossier: string;
  beforeAll(() => {
    dossier = mkdtempSync(join(tmpdir(), 'cap-emploi-suivi-'));
    cpSync(DONNEES, dossier, { recursive: true });
  });
  afterAll(() => rmSync(dossier, { recursive: true, force: true }));

  it('aperçu par défaut, _SUIVI.md intact ; un suivi généré n’est pas relu par la reprise', () => {
    const db = ouvrirBase(':memory:');
    importerHistorique(db, dossier);
    const original = readFileSync(join(dossier, 'candidatures', '_SUIVI.md'), 'utf8');
    const r = ecrireSuivi(db, dossier);
    expect(r.fichier).toBe(join(dossier, 'candidatures', '_SUIVI.genere.md'));
    expect(readFileSync(join(dossier, 'candidatures', '_SUIVI.md'), 'utf8')).toBe(original);
    expect(r).toMatchObject({ en_cours: 3, sans_suite: 1, closes: 3 });

    const r2 = ecrireSuivi(db, dossier, { remplacer: true });
    expect(r2.fichier).toBe(join(dossier, 'candidatures', '_SUIVI.md'));
    const db2 = ouvrirBase(':memory:');
    const rapport = importerHistorique(db2, dossier);
    expect(rapport.suivi.ignore).toBeTruthy();
    expect(rapport.suivi.lignes).toBe(0);
    writeFileSync(join(dossier, 'candidatures', '_SUIVI.md'), original);
    expect(trouverOffre(db2, 'linkedin', '4200000099')).toBeUndefined();
    expect(detailOffre(db, trouverOffre(db, 'linkedin', '4200000099')!.id)!.candidature).toBeTruthy();
  });
});
