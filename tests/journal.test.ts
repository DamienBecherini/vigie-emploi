import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ouvrirBase, type Base } from '../src/db/base.ts';
import { ajouterStatut, detailOffre, enregistrerCandidature, enregistrerOffre, offreParId, trouverOffre } from '../src/core/offres.ts';
import {
  ajouterEvenement,
  cheminRelatif,
  echeances,
  estFutur,
  journal,
  lireDateEvenement,
  marquerFait,
  modifierEvenement,
  prochaineEcheance,
  supprimerEvenement,
} from '../src/core/evenements.ts';
import { fichiersDossier, fichierSur } from '../src/core/fichiers.ts';
import { statistiques } from '../src/core/statistiques.ts';
import { noterEntree } from '../src/core/notation.ts';
import { importerHistorique } from '../src/import/historique.ts';
import { devinerType, lignesDuSuivi } from '../src/import/journal.ts';
import { genererSuivi } from '../src/export/suivi.ts';
import { ingerer } from '../src/ingest/ingest.ts';
import { creerApp } from '../src/api/serveur.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const DONNEES = join(FIXTURES, 'donnees');
/** « Maintenant » des tests : lundi 02/11/2026, 10 h (heure locale). */
const NOW = new Date(2026, 10, 2, 10, 0);

function offre(db: Base, idSite: string, entreprise = 'Kappa'): number {
  return enregistrerOffre(db, 'linkedin', idSite, { titre: 'Développeur API', entreprise }, 'manuel').offre.id;
}

describe('dates des événements', () => {
  it('formats acceptés, normalisés en AAAA-MM-JJ[THH:MM]', () => {
    expect(lireDateEvenement('05/11/2026', NOW)).toBe('2026-11-05');
    expect(lireDateEvenement('5/11/2026 14:30', NOW)).toBe('2026-11-05T14:30');
    expect(lireDateEvenement('05/11/2026 à 9 h 05', NOW)).toBe('2026-11-05T09:05');
    expect(lireDateEvenement('2026-11-05T14:30:00Z', NOW)).toBe('2026-11-05T14:30');
    expect(lireDateEvenement('demain', NOW)).toBe('2026-11-03');
    expect(lireDateEvenement('+7', NOW)).toBe('2026-11-09');
    expect(() => lireDateEvenement('31/02/2026', NOW)).toThrow(/invalide/);
    expect(() => lireDateEvenement('bientôt', NOW)).toThrow(/invalide/);
  });
  it('futur : une date seule d’aujourd’hui ne l’est pas, une heure plus tard aujourd’hui oui', () => {
    expect(estFutur('2026-11-02', NOW)).toBe(false);
    expect(estFutur('2026-11-02T15:00', NOW)).toBe(true);
    expect(estFutur('2026-11-03', NOW)).toBe(true);
  });
  it('chemins de fichiers : relatifs, sans traversée', () => {
    expect(cheminRelatif('candidatures\\x\\devis.md')).toBe('candidatures/x/devis.md');
    expect(() => cheminRelatif('../secret.txt')).toThrow(/refusé/);
    expect(() => cheminRelatif('candidatures/../../x')).toThrow(/refusé/);
    expect(() => cheminRelatif('C:/Windows/win.ini')).toThrow(/absolu/);
    expect(() => cheminRelatif('/etc/passwd')).toThrow(/absolu/);
    expect(() => cheminRelatif('.git/config')).toThrow(/refusé/);
  });
});

describe('journal et échéances', () => {
  let db: Base;
  let id: number;
  beforeAll(() => {
    db = ouvrirBase(':memory:');
    id = offre(db, '4300000001');
  });

  it('un événement passé est fait, un futur est une échéance ; journal ordonné', () => {
    const passe = ajouterEvenement(db, id, { type: 'message', sens: 'envoyé', le: '28/10/2026', resume: 'Candidature envoyée' }, 'cli', { maintenant: NOW });
    expect(passe).toMatchObject({ fait: true, sens: 'envoye', le: '2026-10-28', fichiers: [], origine: 'cli' });
    const retard = ajouterEvenement(db, id, { type: 'message', le: '01/11/2026', resume: 'Relancer', fait: false }, 'cli', { maintenant: NOW });
    const futur = ajouterEvenement(db, id, { type: 'entretien', le: '05/11/2026 14:00', resume: 'Entretien technique', canal: 'Teams' }, 'mcp', { maintenant: NOW });
    expect(futur.fait).toBe(false);
    const devis = ajouterEvenement(
      db,
      id,
      { type: 'proposition', le: '30/10/2026', resume: 'Devis', montant: '3 000', unite: '€ HT', jours: '6', fichiers: ['candidatures/kappa/devis.md'] },
      'interface',
      { maintenant: NOW },
    );
    expect(devis).toMatchObject({ montant: 3000, unite: '€ HT', jours: 6, fichiers: ['candidatures/kappa/devis.md'] });

    const j = journal(db, id, NOW);
    expect(j.map((e) => e.id)).toEqual([retard.id, futur.id, devis.id, passe.id]);
    expect(j[0]).toMatchObject({ echeance: true, en_retard: true });
    expect(j[1]).toMatchObject({ echeance: true, en_retard: false });
    expect(j[2]).toMatchObject({ echeance: false, en_retard: false });
  });

  it('échéances sur N jours + retards ; marquer fait, modifier, supprimer', () => {
    const autre = offre(db, '4300000002', 'Lambda');
    ajouterEvenement(db, autre, { type: 'note', le: '20/11/2026', resume: 'Loin', fait: false }, 'cli', { maintenant: NOW });
    const r = echeances(db, { jours: 7, maintenant: NOW });
    expect(r.en_retard.map((e) => e.resume)).toEqual(['Relancer']);
    expect(r.a_venir.map((e) => [e.resume, e.entreprise])).toEqual([['Entretien technique', 'Kappa']]);
    expect(echeances(db, { jours: 30, maintenant: NOW }).a_venir).toHaveLength(2);

    const relance = r.en_retard[0];
    expect(prochaineEcheance(db, id)!.id).toBe(relance.id);
    expect(marquerFait(db, relance.id).fait).toBe(true);
    expect(echeances(db, { maintenant: NOW }).en_retard).toHaveLength(0);
    expect(prochaineEcheance(db, id)!.resume).toBe('Entretien technique');

    const m = modifierEvenement(db, relance.id, { resume: 'Relance envoyée', canal: '', details: 'Par e-mail' });
    expect(m).toMatchObject({ resume: 'Relance envoyée', canal: null, details: 'Par e-mail' });
    expect(m.maj_le).toBeTruthy();
    expect(() => modifierEvenement(db, relance.id, { resume: ' ' })).toThrow(/Résumé/);
    expect(() => ajouterEvenement(db, id, { type: 'appel', resume: 'x' }, 'cli')).toThrow(/Type d'événement inconnu/);
    expect(() => ajouterEvenement(db, 9999, { type: 'note', resume: 'x' }, 'cli')).toThrow(/introuvable/);
    expect(() => ajouterEvenement(db, id, { type: 'note', resume: 'x', fichiers: ['../x'] }, 'cli')).toThrow(/refusé/);
    supprimerEvenement(db, relance.id);
    expect(detailOffre(db, id)!.evenements.map((e) => e.resume)).not.toContain('Relance envoyée');
  });

  it('suivi généré : la prochaine action vient de la prochaine échéance, sinon du champ', () => {
    ajouterStatut(db, id, 'envoyee', { origine: 'cli' });
    enregistrerCandidature(db, id, { prochaine_action: 'Attendre' });
    const ligne = () => genererSuivi(db, DONNEES, NOW).markdown.split('\n').find((l) => l.includes('**Kappa**'))!;
    expect(ligne()).toContain('| **05/11 14 h 00** : Entretien technique |');
    const e = prochaineEcheance(db, id)!;
    marquerFait(db, e.id);
    expect(ligne()).toContain('| Attendre |');
  });

  it('statistiques : envoyées, réponses, entretiens, propositions, délai', () => {
    const db2 = ouvrirBase(':memory:');
    const a = offre(db2, '4300000010', 'A');
    const b = offre(db2, '4300000011', 'B');
    offre(db2, '4300000012', 'C'); // jamais envoyée
    enregistrerCandidature(db2, a, { envoyee_le: '2026-10-01' });
    enregistrerCandidature(db2, b, { envoyee_le: '2026-10-10' });
    ajouterStatut(db2, a, 'envoyee');
    ajouterStatut(db2, b, 'envoyee');
    ajouterEvenement(db2, a, { type: 'message', sens: 'recu', le: '05/10/2026', resume: 'Réponse' }, 'cli', { maintenant: NOW });
    ajouterEvenement(db2, a, { type: 'entretien', le: '12/10/2026', resume: 'Entretien' }, 'cli', { maintenant: NOW });
    ajouterEvenement(db2, a, { type: 'proposition', sens: 'recu', le: '20/10/2026', resume: 'Offre' }, 'cli', { maintenant: NOW });
    expect(statistiques(db2)).toEqual({
      envoyees: 2,
      reponses: 1,
      entretiens: 1,
      propositions: 1,
      delai_moyen_reponse_jours: 4,
      delai_base: 1,
    });
  });
});

describe('reprise des journaux des dossiers', () => {
  let db: Base;
  let acme: number;
  beforeAll(() => {
    db = ouvrirBase(':memory:');
    importerHistorique(db, DONNEES);
    acme = trouverOffre(db, 'linkedin', '4200000099')!.id;
  });

  it('lignes du tableau et cases cochées datées ; types devinés, fichiers liés', () => {
    const r = importerHistorique(db, DONNEES).journal; // deuxième passe : rien de neuf
    expect(r).toMatchObject({ dossiers: 1, lignes: 6, evenements_crees: 0, evenements_existants: 6, evenements_retires: 0 });
    expect(r.non_typees.map((n) => n.extrait)).toEqual(['Fiche relue.']);
    expect(r.sans_date.map((n) => n.extrait)).toEqual(['Point fait sans date']);

    const j = journal(db, acme, NOW);
    expect(j.map((e) => [e.le, e.type, e.sens])).toEqual([
      ['2026-10-31', 'test', 'recu'],
      ['2026-10-30', 'note', null],
      ['2026-10-29', 'proposition', 'envoye'],
      ['2026-10-27', 'entretien', null],
      ['2026-10-24', 'message', 'recu'],
      ['2026-10-20', 'message', 'envoye'],
    ]);
    expect(j.every((e) => e.fait && e.origine === 'import')).toBe(true);
    const devis = j.find((e) => e.type === 'proposition')!;
    expect(devis).toMatchObject({ montant: 3000, unite: '€ HT', jours: 6, fichiers: ['candidatures/acme-developpeur-php/devis-2026-10-29.md'] });
    expect(j.find((e) => e.type === 'entretien')!.fichiers).toEqual(['candidatures/acme-developpeur-php/compte-rendu-appel.md']);
  });

  it('formats de suivi : puces datées, cases non cochées ignorées, blocs de code ignorés', () => {
    const { lignes, sansDate } = lignesDuSuivi(
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
    expect(lignes).toEqual([
      { numero: 3, le: '2026-10-13', texte: '**Message envoyé** à Max (LinkedIn).' },
      { numero: 4, le: '2026-10-26', texte: 'Annonce relue (26/10)' },
    ]);
    expect(sansDate).toEqual([]);
    expect(devinerType('Réponse le 14/10/2026 : **refus**, e-mail type').type).toBe('decision');
    expect(devinerType('**E-mail de Zoé** : le directeur demande un entretien de 30 min')).toMatchObject({ type: 'message', sens: 'recu' });
    expect(devinerType('Candidature envoyée le : 12/10/2026 (e-mail, CV joint)')).toMatchObject({ type: 'message', sens: 'envoye' });
    expect(devinerType("14/10/2026 : proposition d'offre du conseiller France Travail").type).not.toBe('proposition');
  });

  it('fichiers du dossier : liste et accès limité au dossier de données', () => {
    const f = fichiersDossier(db, DONNEES, acme);
    expect(f.dossier).toBe('candidatures/acme-developpeur-php');
    expect(f.fichiers.map((x) => x.nom)[0]).toBe('dossier-candidature.md');
    expect(f.fichiers.map((x) => x.chemin)).toContain('candidatures/acme-developpeur-php/devis-2026-10-29.md');
    expect(fichierSur(DONNEES, 'candidatures/_SUIVI.md').relatif).toBe('candidatures/_SUIVI.md');
    expect(() => fichierSur(DONNEES, 'candidatures/../../journal.test.ts')).toThrow(/refusé/);
    expect(() => fichierSur(DONNEES, 'candidatures/absent.md')).toThrow(/introuvable/);
  });
});

describe('API : journal, échéances, fichiers', () => {
  const db = ouvrirBase(':memory:');
  importerHistorique(db, DONNEES);
  const app = creerApp(db, { dossierDonnees: DONNEES });
  const acme = trouverOffre(db, 'linkedin', '4200000099')!.id;
  const json = (corps: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });

  it('ajouter, marquer fait, modifier, supprimer ; échéances', async () => {
    const r = await app.request(`/api/offres/${acme}/evenements`, json({ type: 'message', le: '+2', resume: 'Relancer Julie', sens: 'envoye' }));
    expect(r.status).toBe(200);
    const d = (await r.json()) as { evenements: { id: number; resume: string; fait: boolean }[] };
    const e = d.evenements[0];
    expect(e).toMatchObject({ resume: 'Relancer Julie', fait: false });
    const ech = (await (await app.request('/api/echeances?jours=7')).json()) as { a_venir: { id: number }[] };
    expect(ech.a_venir.map((x) => x.id)).toContain(e.id);
    const fait = (await (await app.request(`/api/evenements/${e.id}/fait`, json({ fait: true }))).json()) as typeof d;
    expect(fait.evenements.find((x) => x.id === e.id)!.fait).toBe(true);
    const modif = await app.request(`/api/evenements/${e.id}`, { ...json({ resume: 'Relance faite' }), method: 'PUT' });
    expect(((await modif.json()) as typeof d).evenements.some((x) => x.resume === 'Relance faite')).toBe(true);
    const erreur = await app.request(`/api/offres/${acme}/evenements`, json({ type: 'note', resume: '' }));
    expect(erreur.status).toBe(400);
    expect(((await erreur.json()) as { erreur: string }).erreur).toMatch(/Résumé/);
    const sup = await app.request(`/api/evenements/${e.id}`, { method: 'DELETE' });
    expect(((await sup.json()) as typeof d).evenements.some((x) => x.id === e.id)).toBe(false);
    expect((await app.request('/api/evenements/99999', { method: 'DELETE' })).status).toBe(400);
  });

  it('fichiers : Markdown rendu sans script, texte brut, traversée refusée', async () => {
    const liste = (await (await app.request(`/api/offres/${acme}/fichiers`)).json()) as { fichiers: { chemin: string }[] };
    expect(liste.fichiers.length).toBe(3);
    const md = await app.request('/api/fichier/candidatures/acme-developpeur-php/compte-rendu-appel.md');
    expect(md.status).toBe(200);
    expect(md.headers.get('content-type')).toMatch(/text\/html/);
    expect(md.headers.get('content-security-policy')).toMatch(/default-src 'none'/);
    const html = await md.text();
    expect(html).toContain('<h1>Compte rendu (fictif)</h1>');
    expect(html).toContain('href="devis-2026-10-29.md"'); // lien relatif : reste dans le dossier
    const brut = await app.request('/api/fichier/candidatures/acme-developpeur-php/compte-rendu-appel.md?brut=1');
    expect(brut.headers.get('content-type')).toMatch(/text\/plain/);
    for (const chemin of ['candidatures%2F..%2F..%2Fjournal.test.ts', 'data%2Fx.sqlite', '.git%2Fconfig', 'C%3A%2FWindows%2Fwin.ini']) {
      expect((await app.request(`/api/fichier/${chemin}`)).status, chemin).toBe(403);
    }
    expect((await app.request('/api/fichier/candidatures/absent.md')).status).toBe(404);
  });

  it('hôte étranger refusé (DNS rebinding)', async () => {
    expect((await app.request('/api/sante', { headers: { host: 'exemple.com' } })).status).toBe(403);
    expect((await app.request('/api/sante', { headers: { host: 'localhost:4410' } })).status).toBe(200);
  });
});

describe('offre déjà suivie revue dans un lot, le registre ou une alerte : statut inchangé', () => {
  it('lot et registre (imports) ne font pas reculer une candidature', () => {
    const db = ouvrirBase(':memory:');
    const id = offre(db, '4300000020');
    ajouterStatut(db, id, 'envoyee', { origine: 'cli', le: '2026-10-20' });
    // Revue plus tard dans un lot noté et dans le registre des écartées.
    noterEntree(db, { id, note: 4 }, { origine: 'import-lot', le: '2026-11-02' });
    ajouterStatut(db, id, 'ecartee', { origine: 'import-registre', le: '2026-11-02', commentaire: 'Sans go' });
    ajouterStatut(db, id, 'notee', { origine: 'import-lot', le: '2026-11-02' });
    expect(offreParId(db, id)!.statut).toBe('envoyee');
    // Une décision de l'utilisateur, elle, fait foi.
    ajouterStatut(db, id, 'ecartee', { origine: 'interface', le: '2026-11-03' });
    expect(offreParId(db, id)!.statut).toBe('ecartee');
  });

  it('reprise complète : une offre du suivi revue dans un lot reste à son statut de candidature', () => {
    const db = ouvrirBase(':memory:');
    importerHistorique(db, DONNEES);
    // ACME (envoyée dans le suivi) : rejouer la reprise ne change rien.
    const acme = trouverOffre(db, 'linkedin', '4200000099')!;
    expect(acme.statut).toBe('envoyee');
  });

  describe('ingest', () => {
    let dossier: string;
    beforeAll(() => {
      dossier = mkdtempSync(join(tmpdir(), 'cap-emploi-revue-'));
    });
    afterAll(() => rmSync(dossier, { recursive: true, force: true }));

    it('une alerte qui repropose une offre envoyée laisse son statut et ajoute une trace par jour', async () => {
      const db = ouvrirBase(':memory:');
      cpSync(join(FIXTURES, 'emails'), dossier, { recursive: true });
      await ingerer(db, { dossierEmails: dossier, garder: true, telecharger: false });
      const o = trouverOffre(db, 'linkedin', '4100000001')!;
      ajouterStatut(db, o.id, 'envoyee', { origine: 'cli' });
      const r = await ingerer(db, { dossierEmails: dossier, garder: true, telecharger: false });
      expect(r.nouvelles).toBe(0);
      expect(offreParId(db, o.id)!.statut).toBe('envoyee');
      await ingerer(db, { dossierEmails: dossier, garder: true, telecharger: false });
      const traces = journal(db, o.id).filter((e) => e.resume.startsWith('Revue le'));
      expect(traces).toHaveLength(1);
      expect(traces[0]).toMatchObject({ type: 'note', fait: true, origine: 'import' });
      // Une offre pas encore suivie n'a pas de trace.
      expect(journal(db, trouverOffre(db, 'linkedin', '4100000002')!.id)).toHaveLength(0);
    });
  });
});
