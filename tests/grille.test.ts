import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  appliquerChangement,
  arrondiDemi,
  calculerNote,
  consignesIa,
  interpoler,
  joursSurSiteDepuisTexte,
  noteExemple,
  noteRemuneration,
  noteTeletravail,
  validerGrille,
  verifierSaisie,
  type Grille,
} from '../src/core/grille.ts';
import {
  apercuGrille,
  cheminGrille,
  enregistrerGrille,
  EXEMPLE_GRILLE,
  grilleCourante,
  historiqueGrille,
  initialiserGrille,
  lireFichierGrille,
  modifierGrille,
  renoter,
  restaurerGrille,
} from '../src/core/grille-stockage.ts';
import { ouvrirBase, type Base } from '../src/db/base.ts';
import { enregistrerOffre, notesOffre, offreParId } from '../src/core/offres.ts';
import { modifierSousNotes, noterOffres } from '../src/core/actions.ts';
import { creerApp } from '../src/api/serveur.ts';

const exemple = (): Grille => lireFichierGrille(EXEMPLE_GRILLE)!.grille;

/** Grille simple : technique 50, télétravail 25, rémunération 25. */
function grilleTest(): Grille {
  return validerGrille({
    seuil: 4.5,
    criteres: [
      { id: 'technique', libelle: 'Technique', source: 'ia', poids: 50 },
      { id: 'teletravail', libelle: 'Télétravail', source: 'calcul', calcul: 'teletravail', poids: 25 },
      { id: 'remuneration', libelle: 'Rémunération', source: 'calcul', calcul: 'remuneration', poids: 25 },
    ],
    baremes: {
      teletravail: { jours_sur_site: [10, 8, 6, 3, 1, 1], inconnu: 5 },
      remuneration: {
        reference: 'milieu',
        inconnue: 5,
        salaire: { plancher: 44, cible_basse: 55, cible_haute: 70 },
        tjm: { plancher: 400, cible_basse: 480, cible_haute: 500, plancher_full_remote: 420 },
      },
    },
    regles: [
      { id: 'stage', libelle: 'Stage', effet: 'zero' },
      { id: 'loin', libelle: 'Loin', effet: 'plafond', valeur: 3 },
      { id: 'inactive', libelle: 'Inactive', effet: 'zero', actif: false },
    ],
  });
}

describe('barèmes et arrondi', () => {
  it('arrondit au demi-point le plus proche', () => {
    expect(arrondiDemi(4.24)).toBe(4);
    expect(arrondiDemi(4.25)).toBe(4.5);
    expect(arrondiDemi(4.74)).toBe(4.5);
    expect(arrondiDemi(4.75)).toBe(5);
    expect(arrondiDemi(6.725)).toBe(6.5);
    expect(arrondiDemi(0)).toBe(0);
    expect(arrondiDemi(10)).toBe(10);
  });

  it('interpole la rémunération : 0 sous le plancher, 5 au plancher, 10 à la cible haute', () => {
    expect(interpoler(43.9, 44, 70)).toBe(0);
    expect(interpoler(44, 44, 70)).toBe(5);
    expect(interpoler(57, 44, 70)).toBe(7.5);
    expect(interpoler(70, 44, 70)).toBe(10);
    expect(interpoler(90, 44, 70)).toBe(10);
  });

  it('télétravail : barème par jours sur site, inconnu = neutre + drapeau', () => {
    const b = grilleTest().baremes.teletravail;
    expect([0, 1, 2, 3, 4, 5].map((j) => noteTeletravail(b, j).note)).toEqual([10, 8, 6, 3, 1, 1]);
    const inconnu = noteTeletravail(b, null);
    expect(inconnu.note).toBe(5);
    expect(inconnu.drapeau?.code).toBe('teletravail_inconnu');
  });

  it('rémunération : salaire en euros ou en K€, mensuel, TJM, horaire, plancher full remote', () => {
    const b = grilleTest().baremes.remuneration;
    expect(noteRemuneration(b, { min: 55000, max: 65000, unite: 'an' }, 2).note).toBeCloseTo(5 + (5 * 16) / 26, 6); // milieu 60 K€
    expect(noteRemuneration(b, { min: 60, max: 60, unite: 'an' }, 2).note).toBeCloseTo(5 + (5 * 16) / 26, 6); // 60 lu en K€
    expect(noteRemuneration(b, { min: 5000, max: null, unite: 'mois' }, 2).note).toBeCloseTo(5 + (5 * 16) / 26, 6); // 5 000 €/mois = 60 K€/an
    expect(noteRemuneration(b, { min: 500, max: 500, unite: 'jour' }, 3).note).toBe(10);
    expect(noteRemuneration(b, { min: 400, max: 400, unite: 'jour' }, 3).note).toBe(5);
    // Full remote : plancher 420, donc 400 €/j est en dessous.
    const fr = noteRemuneration(b, { min: 400, max: 400, unite: 'jour' }, 0);
    expect(fr.note).toBe(0);
    expect(fr.drapeau?.code).toBe('sous_plancher');
    expect(noteRemuneration(b, { min: 60, max: 60, unite: 'heure' }, 2).note).toBe(5 + (5 * 20) / 100); // 420 €/j
    const inconnue = noteRemuneration(b, { min: null, max: null, unite: null }, 2);
    expect(inconnue).toMatchObject({ note: 5, drapeau: { code: 'remuneration_inconnue' } });
  });

  it('rémunération : référence min / max / milieu', () => {
    const b = { ...grilleTest().baremes.remuneration };
    const r = { min: 44000, max: 70000, unite: 'an' as const };
    expect(noteRemuneration({ ...b, reference: 'min' }, r, 2).note).toBe(5);
    expect(noteRemuneration({ ...b, reference: 'max' }, r, 2).note).toBe(10);
    expect(noteRemuneration({ ...b, reference: 'milieu' }, r, 2).note).toBe(7.5);
  });

  it('lit les jours sur site dans un texte libre', () => {
    expect(joursSurSiteDepuisTexte('full remote')).toBe(0);
    expect(joursSurSiteDepuisTexte('Full-Remote possible')).toBe(0);
    expect(joursSurSiteDepuisTexte('100 % télétravail')).toBe(0);
    expect(joursSurSiteDepuisTexte("hybride (jusqu'à 2 j de télétravail, donc 3 j sur site)")).toBe(3);
    expect(joursSurSiteDepuisTexte('2 jours de télétravail par semaine')).toBe(3);
    expect(joursSurSiteDepuisTexte('1 j/sem sur site')).toBe(1);
    expect(joursSurSiteDepuisTexte('sur site')).toBe(5);
    expect(joursSurSiteDepuisTexte('Présentiel')).toBe(5);
    expect(joursSurSiteDepuisTexte('hybride NC')).toBeNull();
    expect(joursSurSiteDepuisTexte('télétravail oui (partiel)')).toBeNull();
    expect(joursSurSiteDepuisTexte(null)).toBeNull();
  });
});

describe('calcul de la note', () => {
  const g = grilleTest();

  it('moyenne pondérée normalisée, contributions, arrondi, valeur exacte', () => {
    const d = calculerNote(g, { criteres: { technique: { note: 8, justification: 'PHP' } }, bloquants: [] }, {
      teletravail: '3 j sur site',
      remuneration_min: 57000,
      remuneration_max: 57000,
      remuneration_unite: 'an',
    });
    // 8 × 0,5 + 3 × 0,25 + 7,5 × 0,25 = 6,625
    expect(d.moyenne).toBe(6.625);
    expect(d.note_exacte).toBe(6.625);
    expect(d.note).toBe(6.5);
    expect(d.criteres.map((c) => [c.id, c.note, c.poids_normalise, c.contribution])).toEqual([
      ['technique', 8, 0.5, 4],
      ['teletravail', 3, 0.25, 0.75],
      ['remuneration', 7.5, 0.25, 1.875],
    ]);
    expect(d.entrees).toMatchObject({ jours_sur_site: 3, jours_provenance: 'offre', salaire_min: 57000, unite: 'an', salaire_provenance: 'offre' });
    expect(d.drapeaux).toEqual([]);
  });

  it('les poids sont normalisés quelle que soit leur somme', () => {
    const double = appliquerChangement(g, { poids: { technique: 100, teletravail: 50, remuneration: 50 } });
    const s = { criteres: { technique: { note: 8 } }, entrees: { jours_sur_site: 3, salaire_min: 57000, unite: 'an' as const }, bloquants: [] };
    expect(calculerNote(double, s).note_exacte).toBe(calculerNote(g, s).note_exacte);
  });

  it('les entrées de la saisie passent avant les champs de l’offre', () => {
    const d = calculerNote(g, { criteres: { technique: { note: 8 } }, entrees: { jours_sur_site: 0, salaire_min: 500, unite: 'jour' }, bloquants: [] }, {
      teletravail: 'sur site',
      remuneration_min: 30000,
      remuneration_unite: 'an',
    });
    expect(d.entrees).toMatchObject({ jours_sur_site: 0, jours_provenance: 'saisie', unite: 'jour', salaire_provenance: 'saisie' });
    expect(d.note_exacte).toBe(9); // 8 × 0,5 + 10 × 0,25 + 10 × 0,25
  });

  it('valeurs neutres et drapeaux quand une donnée manque', () => {
    const d = calculerNote(g, { criteres: {}, bloquants: [] }, { teletravail: 'hybride' });
    expect(d.criteres.map((c) => [c.id, c.note, c.origine])).toEqual([
      ['technique', 5, 'neutre'],
      ['teletravail', 5, 'neutre'],
      ['remuneration', 5, 'neutre'],
    ]);
    expect(d.drapeaux.map((x) => x.code)).toEqual(['critere_manquant:technique', 'teletravail_inconnu', 'remuneration_inconnue']);
    expect(d.note).toBe(5);
  });

  it('règles bloquantes : zéro, plafond, désactivée ou inconnue ignorée', () => {
    const s = (bloquants: string[]) => ({ criteres: { technique: { note: 9 } }, entrees: { jours_sur_site: 0 }, bloquants });
    const libre = calculerNote(g, s([]));
    expect(libre.note_exacte).toBe(8.25);
    const plafond = calculerNote(g, s(['loin']));
    expect(plafond).toMatchObject({ moyenne: 8.25, note_exacte: 3, note: 3 });
    expect(plafond.regles).toEqual([{ id: 'loin', libelle: 'Loin', effet: 'plafond', valeur: 3, effective: true }]);
    const zero = calculerNote(g, s(['loin', 'stage']));
    expect(zero.note).toBe(0);
    expect(zero.regles.map((r) => r.id)).toEqual(['loin', 'stage']);
    const ignorees = calculerNote(g, s(['inactive', 'disparue']));
    expect(ignorees.note_exacte).toBe(8.25);
    expect(ignorees.bloquants_ignores).toEqual(['inactive', 'disparue']);
    // Un plafond au-dessus de la moyenne ne change rien.
    const bas = calculerNote(g, { criteres: { technique: { note: 1 } }, entrees: { jours_sur_site: 5 }, bloquants: ['loin'] });
    expect(bas.regles[0].effective).toBe(false);
  });

  it('valide une saisie : critères calculés, critères et règles inconnus refusés', () => {
    expect(() => verifierSaisie(g, { criteres: { teletravail: { note: 3 } } })).toThrow(/calculé.*jours_sur_site/);
    expect(() => verifierSaisie(g, { criteres: { inconnu: { note: 3 } } })).toThrow(/Critère inconnu.*technique/);
    expect(() => verifierSaisie(g, { bloquants: ['armee'] })).toThrow(/Règle bloquante inconnue : armee.*stage, loin/);
    expect(() => verifierSaisie(g, { criteres: { technique: { note: 12 } } })).toThrow(/0 à 10/);
    expect(verifierSaisie(g, { criteres: { technique: { note: '6,5' } } }).criteres.technique.note).toBe(6.5);
  });

  it('valide une grille : identifiants, doublons, poids, barèmes, exemples', () => {
    const base = structuredClone(g) as unknown as Record<string, unknown>;
    expect(() => validerGrille({ ...base, criteres: [...g.criteres, g.criteres[0]] })).toThrow(/critère en double : technique/);
    expect(() => validerGrille({ ...base, criteres: g.criteres.map((c) => ({ ...c, poids: 0 })) })).toThrow(/au moins un critère/);
    expect(() => validerGrille({ ...base, inconnu: 1 })).toThrow(/Grille invalide/);
    const b = structuredClone(g.baremes);
    b.remuneration.salaire.cible_haute = 40;
    expect(() => validerGrille({ ...base, baremes: b })).toThrow(/cible haute doit dépasser le plancher/);
    expect(() => validerGrille({ ...base, criteres: [{ id: 'x', libelle: 'X', source: 'calcul', poids: 1 }] })).toThrow(/calcul.*attendu/);
    expect(() =>
      validerGrille({ ...base, exemples: [{ titre: 'E', criteres: { teletravail: { note: 1, justification: '' } } }] }),
    ).toThrow(/critère IA inconnu teletravail/);
    expect(() => validerGrille({ ...base, regles: [{ id: 'p', libelle: 'P', effet: 'plafond' }] })).toThrow(/valeur.*plafond/);
  });

  it('modification partielle : poids, barèmes, règles, inventaire', () => {
    const g2 = appliquerChangement(exemple(), {
      poids: { technique: 50 },
      seuil: 5,
      baremes: { remuneration: { salaire: { plancher: 45 } }, teletravail: { jours_sur_site: [10, 9, 7, 4, 1, 0] } },
      regles: [
        { id: 'stage', actif: false },
        { id: 'esn', libelle: 'Régie en ESN', effet: 'plafond', valeur: 4 },
      ],
      inventaire: { ajouter: [{ techno: 'Kubernetes', niveau: 'leger' }, { techno: 'Go', niveau: 'zero' }], retirer: ['Java'] },
    });
    expect(g2.criteres.find((c) => c.id === 'technique')!.poids).toBe(50);
    expect(g2.seuil).toBe(5);
    expect(g2.baremes.remuneration.salaire).toMatchObject({ plancher: 45, cible_haute: 60 });
    expect(g2.baremes.teletravail.jours_sur_site[5]).toBe(0);
    expect(g2.regles.find((r) => r.id === 'stage')!.actif).toBe(false);
    expect(g2.regles.find((r) => r.id === 'esn')).toMatchObject({ effet: 'plafond', valeur: 4, actif: true });
    expect(g2.inventaire.find((t) => t.techno === 'Kubernetes')!.niveau).toBe('leger');
    expect(g2.inventaire.some((t) => t.techno === 'Java')).toBe(false);
    expect(() => appliquerChangement(exemple(), { poids: { inconnu: 3 } })).toThrow(/Critère inconnu/);
    expect(() => appliquerChangement(exemple(), { regles: [{ id: 'neuve' }] })).toThrow(/libelle.*effet/);
    expect(() => appliquerChangement(exemple(), { inventaire: { retirer: ['Cobol'] } })).toThrow(/absente/);
    // Retirer puis ajouter la même techno dans un appel la remplace (elle n'est jamais perdue).
    const g3 = appliquerChangement(exemple(), { inventaire: { retirer: ['PHP'], ajouter: [{ techno: 'php', niveau: 'moyen' }] } });
    expect(g3.inventaire.filter((t) => t.techno.toLowerCase() === 'php')).toEqual([{ techno: 'php', niveau: 'moyen' }]);
  });

  it('exemples de référence et consignes pour l’IA', () => {
    const e = exemple();
    expect(e.exemples.map((x) => noteExemple(e, x).note)).toEqual([8, 3.5, 0]);
    const c = consignesIa(e).join('\n');
    expect(c).toMatch(/technique \(Adéquation technique, 35 %\)/);
    expect(c).toMatch(/Ne note pas teletravail ni remuneration/);
    expect(c).toMatch(/stage = Stage ou alternance → 0/);
  });
});

describe('stockage, versions et renotation', () => {
  let dossier: string;
  let db: Base;
  let ids: number[];

  beforeEach(() => {
    dossier = mkdtempSync(join(tmpdir(), 'vigie-emploi-grille-'));
    db = ouvrirBase(':memory:');
    ids = [];
    for (let i = 0; i < 3; i++) {
      const { offre } = enregistrerOffre(db, 'linkedin', String(500 + i), { titre: `Offre ${i}`, teletravail: ['full remote', '3 j sur site', 'hybride'][i], remuneration: ['55-65 K€', 'NC', '450 €/j'][i] }, 'email');
      ids.push(offre.id);
    }
  });

  const ecrireGrille = (g: unknown) => {
    mkdirSync(join(dossier, 'profil'), { recursive: true });
    writeFileSync(cheminGrille(dossier), JSON.stringify(g), 'utf8');
  };

  it('sans grille : la note à critères est refusée, la note globale reste possible', () => {
    expect(grilleCourante(db, dossier)).toBeNull();
    const charger = () => grilleCourante(db, dossier);
    expect(() => noterOffres(db, [{ id: ids[0], criteres: { technique: { note: 8 } } }], 'cli', { grille: charger })).toThrow(/sans grille/);
    const [r] = noterOffres(db, [{ id: ids[0], note: 6 }], 'cli', { grille: charger });
    expect(r.note).toBe(6);
    rmSync(dossier, { recursive: true, force: true });
  });

  it('fichier → version 1, note calculée, champ note ignoré et signalé, ancienne note figée', () => {
    initialiserGrille(db, dossier);
    const v = grilleCourante(db, dossier)!;
    expect(v).toMatchObject({ version: 1, auteur: 'fichier' });
    expect(JSON.parse(readFileSync(cheminGrille(dossier), 'utf8'))).toMatchObject({ version: 1, nom: "Grille d'exemple" });

    noterOffres(db, [{ id: ids[2], note: 6, colle: 'ancienne grille' }], 'cli');
    const [r] = noterOffres(
      db,
      [{ id: ids[0], note: 9, criteres: { technique: { note: 8, justification: 'PHP' }, role: { note: 7 }, interet: { note: 6 }, risque: { note: 7 } }, colle: 'API' }],
      'mcp',
      { grille: () => grilleCourante(db, dossier) },
    );
    // 8×.35 + 10×.2 (full remote) + 10×.2 (60 K€ ≥ cible haute 60) + 7×.1 + 6×.1 + 7×.05 = 8,45
    expect(r).toMatchObject({ note: 8.5, note_exacte: 8.45, grille_version: 1, statut: 'notee' });
    expect(r.avertissements?.[0]).toMatch(/« note » \(9\) ignoré/);
    const n = notesOffre(db, ids[0])[0];
    expect(n).toMatchObject({ note: 8.5, note_exacte: 8.45, note_brute: 8.45, grille_version: '1', colle: 'API' });
    expect(n.decomposition!.criteres).toHaveLength(6);
    expect(notesOffre(db, ids[2])[0]).toMatchObject({ note: 6, saisie: null, decomposition: null });
    rmSync(dossier, { recursive: true, force: true });
  });

  it('aperçu, enregistrement, renotation instantanée, seuil, historique, restauration', () => {
    initialiserGrille(db, dossier);
    const charger = () => grilleCourante(db, dossier);
    const criteres = { technique: { note: 6 }, role: { note: 6 }, interet: { note: 6 }, risque: { note: 6 } };
    noterOffres(db, ids.map((id) => ({ id, criteres })), 'cli', { grille: charger });
    const avant = ids.map((id) => offreParId(db, id)!.note);
    // 0 : 6×.6 + 10×.2 + 10×.2 = 7,6 → 7,5 ; 1 : 3 j sur site, salaire NC → 6×.6 + 3×.2 + 5×.2 = 5,2 → 5 ;
    // 2 : hybride inconnu, 450 €/j ≥ cible 450 → 6×.6 + 5×.2 + 10×.2 = 6,6 → 6,5
    expect(avant).toEqual([7.5, 5, 6.5]);

    const g = charger()!.grille;
    const plusRemote = appliquerChangement(g, { poids: { teletravail: 60 }, seuil: 6 });
    const ap = apercuGrille(db, plusRemote, g.seuil);
    expect(ap.offres_recalculees).toBe(3);
    expect(ap.changees).toBeGreaterThan(0);
    expect(ids.map((id) => offreParId(db, id)!.note)).toEqual(avant); // l'aperçu n'écrit rien
    expect(ap.descendent.map((c) => c.id)).toContain(ids[1]);

    const r = enregistrerGrille(db, dossier, plusRemote, { auteur: 'interface', resume: 'Télétravail prioritaire' });
    expect(r.version.version).toBe(2);
    expect(r.impact.changees).toBe(ap.changees);
    const apres = ids.map((id) => offreParId(db, id)!.note);
    expect(apres).not.toEqual(avant);
    expect(notesOffre(db, ids[0])[0]).toMatchObject({ grille_version: '2' });
    expect(notesOffre(db, ids[0])).toHaveLength(1); // recalcul sur place, pas de nouvelle ligne
    expect(JSON.parse(readFileSync(cheminGrille(dossier), 'utf8'))).toMatchObject({ version: 2, seuil: 6, resume: 'Télétravail prioritaire' });

    expect(() => enregistrerGrille(db, dossier, plusRemote, { auteur: 'cli', resume: 'rien' })).toThrow(/Aucun changement/);
    expect(() => enregistrerGrille(db, dossier, g, { auteur: 'cli', resume: ' ' })).toThrow(/Résumé/);

    const m = modifierGrille(db, dossier, { regles: [{ id: 'stage', actif: false }] }, { auteur: 'mcp', resume: 'essai', essai: true });
    expect(m).toMatchObject({ enregistree: false, version: 2 });
    expect(historiqueGrille(db).map((h) => [h.version, h.auteur])).toEqual([
      [2, 'interface'],
      [1, 'fichier'],
    ]);

    const rest = restaurerGrille(db, dossier, 1, { auteur: 'cli' });
    expect(rest.version).toMatchObject({ version: 3, resume: 'Retour à la version 1' });
    expect(ids.map((id) => offreParId(db, id)!.note)).toEqual(avant);
    expect(renoter(db, dossier).impact).toMatchObject({ offres_recalculees: 3, changees: 0 });
    rmSync(dossier, { recursive: true, force: true });
  });

  it('fichier modifié à la main → nouvelle version ; fichier supprimé → réécrit ; fichier invalide → erreur claire', () => {
    initialiserGrille(db, dossier);
    noterOffres(db, [{ id: ids[0], criteres: { technique: { note: 2 } }, bloquants: ['stage'] }], 'cli', { grille: () => grilleCourante(db, dossier) });
    expect(offreParId(db, ids[0])!.note).toBe(0);
    const brut = JSON.parse(readFileSync(cheminGrille(dossier), 'utf8'));
    brut.regles[0].actif = false;
    ecrireGrille(brut);
    const v = grilleCourante(db, dossier)!;
    expect(v).toMatchObject({ version: 2, auteur: 'fichier', resume: 'Modifiée dans le fichier grille.json' });
    expect(offreParId(db, ids[0])!.note).toBeGreaterThan(0); // renotée : la règle stage est désactivée
    expect(notesOffre(db, ids[0])[0].decomposition!.bloquants_ignores).toEqual(['stage']);

    rmSync(cheminGrille(dossier));
    expect(grilleCourante(db, dossier)!.version).toBe(2);
    expect(existsSync(cheminGrille(dossier))).toBe(true);

    ecrireGrille({ ...brut, seuil: 'haut' });
    expect(() => grilleCourante(db, dossier)).toThrow(/Grille invalide.*seuil/);
    rmSync(dossier, { recursive: true, force: true });
  });

  it('correction des sous-notes dans l’interface : nouvelle ligne d’historique, origines conservées', () => {
    initialiserGrille(db, dossier);
    const v = grilleCourante(db, dossier)!;
    noterOffres(db, [{ id: ids[1], criteres: { technique: { note: 8, justification: 'IA' }, role: { note: 6 } }, colle: 'API' }], 'mcp', { grille: () => v });
    const r = modifierSousNotes(db, ids[1], { criteres: { role: { note: 9, justification: 'Vu en entretien' } }, entrees: { jours_sur_site: 1 } }, 'interface', v);
    const notes = notesOffre(db, ids[1]);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ origine: 'interface', colle: 'API' });
    expect(notes[0].saisie!.criteres).toMatchObject({ technique: { note: 8, origine: 'ia' }, role: { note: 9, origine: 'interface' } });
    const d = notes[0].decomposition!;
    expect(d.criteres.find((c) => c.id === 'role')).toMatchObject({ note: 9, origine: 'interface', justification: 'Vu en entretien' });
    expect(d.criteres.find((c) => c.id === 'teletravail')).toMatchObject({ note: 8 });
    expect(r.note).toBe(d.note);
    rmSync(dossier, { recursive: true, force: true });
  });

  it('API : grille, aperçu, enregistrement, historique, restauration, sous-notes', async () => {
    initialiserGrille(db, dossier);
    const app = creerApp(db, { dossierDonnees: dossier });
    const envoyer = (chemin: string, method: string, corps?: unknown) =>
      app.request(chemin, { method, body: corps === undefined ? undefined : JSON.stringify(corps), headers: { 'Content-Type': 'application/json' } });
    const g = (await (await app.request('/api/grille')).json()) as { version: number; grille: Grille; exemples: { note: number }[] };
    expect(g.version).toBe(1);
    expect(g.exemples.map((e) => e.note)).toEqual([8, 3.5, 0]);

    const n = await envoyer(`/api/offres/${ids[0]}/sous-notes`, 'PUT', { criteres: { technique: { note: 7, justification: 'à la main' } } });
    expect(((await n.json()) as { notes: { origine: string; decomposition: unknown }[] }).notes[0]).toMatchObject({ origine: 'interface' });

    const modifiee = appliquerChangement(g.grille, { seuil: 9 });
    const ap = (await (await envoyer('/api/grille/apercu', 'POST', { grille: modifiee })).json()) as { offres_recalculees: number; descendent: unknown[] };
    expect(ap.offres_recalculees).toBe(1);
    expect(ap.descendent).toHaveLength(1);
    expect((await envoyer('/api/grille', 'PUT', { grille: modifiee, resume: '' })).status).toBe(400);
    const sauve = (await (await envoyer('/api/grille', 'PUT', { grille: modifiee, resume: 'Seuil 9' })).json()) as { version: number };
    expect(sauve.version).toBe(2);
    const h = (await (await app.request('/api/grille/historique')).json()) as { version: number; auteur: string }[];
    expect(h.map((x) => [x.version, x.auteur])).toEqual([
      [2, 'interface'],
      [1, 'fichier'],
    ]);
    const v1 = (await (await app.request('/api/grille/versions/1')).json()) as { grille: Grille };
    expect(v1.grille.seuil).toBe(4.5);
    const rest = (await (await envoyer('/api/grille/restaurer', 'POST', { version: 1 })).json()) as { version: number };
    expect(rest.version).toBe(3);
    expect((await envoyer('/api/grille', 'PUT', { grille: { seuil: 2 }, resume: 'cassée' })).status).toBe(400);
    rmSync(dossier, { recursive: true, force: true });
  });
});

describe('règle « plafond si critère faible »', () => {
  const g = validerGrille({
    ...grilleTest(),
    regles: [{ id: 'technique-faible', libelle: 'Technique insuffisante', effet: 'plafond_critere', critere: 'technique', seuil: 4 }],
  });

  it('plafonne la note à la sous-note technique quand elle est sous le seuil, sans signalement de l’IA', () => {
    // technique 2 × 50 % + télétravail 10 × 25 % + rémunération 10 × 25 % = 6 → plafonnée à 2
    const d = calculerNote(g, { criteres: { technique: { note: 2 } }, entrees: { jours_sur_site: 0, salaire_min: 70000, unite: 'an' }, bloquants: [] });
    expect(d.moyenne).toBe(6);
    expect(d.note).toBe(2);
    expect(d.regles).toEqual([expect.objectContaining({ id: 'technique-faible', effet: 'plafond_critere', valeur: 2, effective: true })]);
  });

  it('ne s’applique ni au-dessus du seuil ni sur une sous-note neutre (critère manquant)', () => {
    expect(calculerNote(g, { criteres: { technique: { note: 4 } }, bloquants: [] }).regles).toEqual([]);
    expect(calculerNote(g, { criteres: {}, bloquants: [] }).regles).toEqual([]);
  });

  it('refuse une règle sans critère ni seuil', () => {
    expect(() => validerGrille({ ...grilleTest(), regles: [{ id: 'x', libelle: 'X', effet: 'plafond_critere' }] })).toThrow();
  });
});
