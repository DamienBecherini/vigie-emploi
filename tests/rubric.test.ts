import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyChange,
  roundedHalf,
  computeScore,
  instructionsAi,
  interpolate,
  onsiteDaysFromText,
  scoreExample,
  scoreCompensation,
  scoreRemote,
  validateRubric,
  checkInput,
  type Rubric,
} from '../src/core/rubric.ts';
import {
  previewRubric,
  pathRubric,
  saveRubric,
  EXAMPLE_RUBRIC,
  rubricCurrent,
  historyRubric,
  initializeRubric,
  readFileRubric,
  updateRubric,
  rescore,
  restoreRubric,
} from '../src/core/rubric-storage.ts';
import { openDatabase, type Database } from '../src/db/database.ts';
import { saveOffer, scoresOffer, offerById } from '../src/core/offers.ts';
import { updateSubScores, scoreOffers } from '../src/core/actions.ts';
import { createApp } from '../src/api/server.ts';

const example = (): Rubric => readFileRubric(EXAMPLE_RUBRIC)!.rubric;

/** Grille simple : technique 50, télétravail 25, rémunération 25. */
function rubricTest(): Rubric {
  return validateRubric({
    threshold: 4.5,
    criteria: [
      { id: 'technique', label: 'Technique', source: 'ai', weight: 50 },
      { id: 'remote', label: 'Télétravail', source: 'computation', computation: 'remote', weight: 25 },
      { id: 'compensation', label: 'Rémunération', source: 'computation', computation: 'compensation', weight: 25 },
    ],
    scales: {
      remote: { onsite_days: [10, 8, 6, 3, 1, 1], unknown: 5 },
      compensation: {
        reference: 'middle',
        unknown: 5,
        salary: { floor: 44, target_low: 55, target_high: 70 },
        daily_rate: { floor: 400, target_low: 480, target_high: 500, floor_full_remote: 420 },
      },
    },
    rules: [
      { id: 'stage', label: 'Stage', effect: 'zero' },
      { id: 'far', label: 'Loin', effect: 'cap', value: 3 },
      { id: 'inactive', label: 'Inactive', effect: 'zero', active: false },
    ],
  });
}

describe('barèmes et arrondi', () => {
  it('arrondit au demi-point le plus proche', () => {
    expect(roundedHalf(4.24)).toBe(4);
    expect(roundedHalf(4.25)).toBe(4.5);
    expect(roundedHalf(4.74)).toBe(4.5);
    expect(roundedHalf(4.75)).toBe(5);
    expect(roundedHalf(6.725)).toBe(6.5);
    expect(roundedHalf(0)).toBe(0);
    expect(roundedHalf(10)).toBe(10);
  });

  it('interpole la rémunération : 0 sous le plancher, 5 au plancher, 10 à la cible haute', () => {
    expect(interpolate(43.9, 44, 70)).toBe(0);
    expect(interpolate(44, 44, 70)).toBe(5);
    expect(interpolate(57, 44, 70)).toBe(7.5);
    expect(interpolate(70, 44, 70)).toBe(10);
    expect(interpolate(90, 44, 70)).toBe(10);
  });

  it('télétravail : barème par jours sur site, inconnu = neutre + drapeau', () => {
    const b = rubricTest().scales.remote;
    expect([0, 1, 2, 3, 4, 5].map((j) => scoreRemote(b, j).score)).toEqual([10, 8, 6, 3, 1, 1]);
    const unknown = scoreRemote(b, null);
    expect(unknown.score).toBe(5);
    expect(unknown.flag?.code).toBe('remote_unknown');
  });

  it('rémunération : salaire en euros ou en K€, mensuel, TJM, horaire, plancher full remote', () => {
    const b = rubricTest().scales.compensation;
    expect(scoreCompensation(b, { min: 55000, max: 65000, unit: 'year' }, 2).score).toBeCloseTo(5 + (5 * 16) / 26, 6); // milieu 60 K€
    expect(scoreCompensation(b, { min: 60, max: 60, unit: 'year' }, 2).score).toBeCloseTo(5 + (5 * 16) / 26, 6); // 60 lu en K€
    expect(scoreCompensation(b, { min: 5000, max: null, unit: 'month' }, 2).score).toBeCloseTo(5 + (5 * 16) / 26, 6); // 5 000 €/mois = 60 K€/an
    expect(scoreCompensation(b, { min: 500, max: 500, unit: 'day' }, 3).score).toBe(10);
    expect(scoreCompensation(b, { min: 400, max: 400, unit: 'day' }, 3).score).toBe(5);
    // Full remote : plancher 420, donc 400 €/j est en dessous.
    const fr = scoreCompensation(b, { min: 400, max: 400, unit: 'day' }, 0);
    expect(fr.score).toBe(0);
    expect(fr.flag?.code).toBe('sub_floor');
    expect(scoreCompensation(b, { min: 60, max: 60, unit: 'hour' }, 2).score).toBe(5 + (5 * 20) / 100); // 420 €/j
    const unknown = scoreCompensation(b, { min: null, max: null, unit: null }, 2);
    expect(unknown).toMatchObject({ score: 5, flag: { code: 'compensation_unknown' } });
  });

  it('rémunération : référence min / max / milieu', () => {
    const b = { ...rubricTest().scales.compensation };
    const r = { min: 44000, max: 70000, unit: 'year' as const };
    expect(scoreCompensation({ ...b, reference: 'min' }, r, 2).score).toBe(5);
    expect(scoreCompensation({ ...b, reference: 'max' }, r, 2).score).toBe(10);
    expect(scoreCompensation({ ...b, reference: 'middle' }, r, 2).score).toBe(7.5);
  });

  it('lit les jours sur site dans un texte libre', () => {
    expect(onsiteDaysFromText('full remote')).toBe(0);
    expect(onsiteDaysFromText('Full-Remote possible')).toBe(0);
    expect(onsiteDaysFromText('100 % télétravail')).toBe(0);
    expect(onsiteDaysFromText("hybride (jusqu'à 2 j de télétravail, donc 3 j sur site)")).toBe(3);
    expect(onsiteDaysFromText('2 jours de télétravail par semaine')).toBe(3);
    expect(onsiteDaysFromText('1 j/sem sur site')).toBe(1);
    expect(onsiteDaysFromText('sur site')).toBe(5);
    expect(onsiteDaysFromText('Présentiel')).toBe(5);
    expect(onsiteDaysFromText('hybride NC')).toBeNull();
    expect(onsiteDaysFromText('télétravail oui (partiel)')).toBeNull();
    expect(onsiteDaysFromText(null)).toBeNull();
  });
});

describe('calcul de la note', () => {
  const g = rubricTest();

  it('moyenne pondérée normalisée, contributions, arrondi, valeur exacte', () => {
    const d = computeScore(g, { criteria: { technique: { score: 8, justification: 'PHP' } }, blockers: [] }, {
      remote: '3 j sur site',
      compensation_min: 57000,
      compensation_max: 57000,
      compensation_unit: 'year',
    });
    // 8 × 0,5 + 3 × 0,25 + 7,5 × 0,25 = 6,625
    expect(d.average).toBe(6.625);
    expect(d.exact_score).toBe(6.625);
    expect(d.score).toBe(6.5);
    expect(d.criteria.map((c) => [c.id, c.score, c.normalized_weight, c.contribution])).toEqual([
      ['technique', 8, 0.5, 4],
      ['remote', 3, 0.25, 0.75],
      ['compensation', 7.5, 0.25, 1.875],
    ]);
    expect(d.inputs).toMatchObject({ onsite_days: 3, days_origin: 'offer', salary_min: 57000, unit: 'year', salary_origin: 'offer' });
    expect(d.flags).toEqual([]);
  });

  it('les poids sont normalisés quelle que soit leur somme', () => {
    const double = applyChange(g, { weight: { technique: 100, remote: 50, compensation: 50 } });
    const s = { criteria: { technique: { score: 8 } }, inputs: { onsite_days: 3, salary_min: 57000, unit: 'year' as const }, blockers: [] };
    expect(computeScore(double, s).exact_score).toBe(computeScore(g, s).exact_score);
  });

  it('les entrées de la saisie passent avant les champs de l’offre', () => {
    const d = computeScore(g, { criteria: { technique: { score: 8 } }, inputs: { onsite_days: 0, salary_min: 500, unit: 'day' }, blockers: [] }, {
      remote: 'sur site',
      compensation_min: 30000,
      compensation_unit: 'year',
    });
    expect(d.inputs).toMatchObject({ onsite_days: 0, days_origin: 'input', unit: 'day', salary_origin: 'input' });
    expect(d.exact_score).toBe(9); // 8 × 0,5 + 10 × 0,25 + 10 × 0,25
  });

  it('valeurs neutres et drapeaux quand une donnée manque', () => {
    const d = computeScore(g, { criteria: {}, blockers: [] }, { remote: 'hybride' });
    expect(d.criteria.map((c) => [c.id, c.score, c.origin])).toEqual([
      ['technique', 5, 'neutral'],
      ['remote', 5, 'neutral'],
      ['compensation', 5, 'neutral'],
    ]);
    expect(d.flags.map((x) => x.code)).toEqual(['criterion_missing:technique', 'remote_unknown', 'compensation_unknown']);
    expect(d.score).toBe(5);
  });

  it('règles bloquantes : zéro, plafond, désactivée ou inconnue ignorée', () => {
    const s = (blockers: string[]) => ({ criteria: { technique: { score: 9 } }, inputs: { onsite_days: 0 }, blockers });
    const free = computeScore(g, s([]));
    expect(free.exact_score).toBe(8.25);
    const cap = computeScore(g, s(['far']));
    expect(cap).toMatchObject({ average: 8.25, exact_score: 3, score: 3 });
    expect(cap.rules).toEqual([{ id: 'far', label: 'Loin', effect: 'cap', value: 3, effective: true }]);
    const zero = computeScore(g, s(['far', 'stage']));
    expect(zero.score).toBe(0);
    expect(zero.rules.map((r) => r.id)).toEqual(['far', 'stage']);
    const ignored = computeScore(g, s(['inactive', 'gone']));
    expect(ignored.exact_score).toBe(8.25);
    expect(ignored.ignored_blockers).toEqual(['inactive', 'gone']);
    // Un plafond au-dessus de la moyenne ne change rien.
    const low = computeScore(g, { criteria: { technique: { score: 1 } }, inputs: { onsite_days: 5 }, blockers: ['far'] });
    expect(low.rules[0].effective).toBe(false);
  });

  it('valide une saisie : critères calculés, critères et règles inconnus refusés', () => {
    expect(() => checkInput(g, { criteria: { remote: { score: 3 } } })).toThrow(/calculé.*onsite_days/);
    expect(() => checkInput(g, { criteria: { unknown: { score: 3 } } })).toThrow(/Critère inconnu.*technique/);
    expect(() => checkInput(g, { blockers: ['armee'] })).toThrow(/Règle bloquante inconnue : armee.*stage, far/);
    expect(() => checkInput(g, { criteria: { technique: { score: 12 } } })).toThrow(/0 à 10/);
    expect(checkInput(g, { criteria: { technique: { score: '6,5' } } }).criteria.technique.score).toBe(6.5);
  });

  it('valide une grille : identifiants, doublons, poids, barèmes, exemples', () => {
    const database = structuredClone(g) as unknown as Record<string, unknown>;
    expect(() => validateRubric({ ...database, criteria: [...g.criteria, g.criteria[0]] })).toThrow(/critère en double : technique/);
    expect(() => validateRubric({ ...database, criteria: g.criteria.map((c) => ({ ...c, weight: 0 })) })).toThrow(/au moins un critère/);
    expect(() => validateRubric({ ...database, unknown: 1 })).toThrow(/Grille invalide/);
    const b = structuredClone(g.scales);
    b.compensation.salary.target_high = 40;
    expect(() => validateRubric({ ...database, scales: b })).toThrow(/cible haute doit dépasser le plancher/);
    expect(() => validateRubric({ ...database, criteria: [{ id: 'x', label: 'X', source: 'computation', weight: 1 }] })).toThrow(/calcul.*attendu/);
    expect(() =>
      validateRubric({ ...database, examples: [{ title: 'E', criteria: { teletravail: { score: 1, justification: '' } } }] }),
    ).toThrow(/critère IA inconnu teletravail/);
    expect(() => validateRubric({ ...database, rules: [{ id: 'p', label: 'P', effect: 'cap' }] })).toThrow(/valeur.*plafond/);
  });

  it('modification partielle : poids, barèmes, règles, inventaire', () => {
    const g2 = applyChange(example(), {
      weight: { technique: 50 },
      threshold: 5,
      scales: { compensation: { salary: { floor: 45 } }, remote: { onsite_days: [10, 9, 7, 4, 1, 0] } },
      rules: [
        { id: 'stage', active: false },
        { id: 'esn', label: 'Régie en ESN', effect: 'cap', value: 4 },
      ],
      inventory: { add: [{ technology: 'Kubernetes', level: 'light' }, { technology: 'Go', level: 'zero' }], remove: ['Java'] },
    });
    expect(g2.criteria.find((c) => c.id === 'technique')!.weight).toBe(50);
    expect(g2.threshold).toBe(5);
    expect(g2.scales.compensation.salary).toMatchObject({ floor: 45, target_high: 60 });
    expect(g2.scales.remote.onsite_days[5]).toBe(0);
    expect(g2.rules.find((r) => r.id === 'stage')!.active).toBe(false);
    expect(g2.rules.find((r) => r.id === 'esn')).toMatchObject({ effect: 'cap', value: 4, active: true });
    expect(g2.inventory.find((t) => t.technology === 'Kubernetes')!.level).toBe('light');
    expect(g2.inventory.some((t) => t.technology === 'Java')).toBe(false);
    expect(() => applyChange(example(), { weight: { unknown: 3 } })).toThrow(/Critère inconnu/);
    expect(() => applyChange(example(), { rules: [{ id: 'new' }] })).toThrow(/libelle.*effet/);
    expect(() => applyChange(example(), { inventory: { remove: ['Cobol'] } })).toThrow(/absente/);
    // Retirer puis ajouter la même techno dans un appel la remplace (elle n'est jamais perdue).
    const g3 = applyChange(example(), { inventory: { remove: ['PHP'], add: [{ technology: 'php', level: 'medium' }] } });
    expect(g3.inventory.filter((t) => t.technology.toLowerCase() === 'php')).toEqual([{ technology: 'php', level: 'medium' }]);
  });

  it('exemples de référence et consignes pour l’IA', () => {
    const e = example();
    expect(e.examples.map((x) => scoreExample(e, x).score)).toEqual([8, 3.5, 0]);
    const c = instructionsAi(e).join('\n');
    expect(c).toMatch(/technique \(Adéquation technique, 35 %\)/);
    expect(c).toMatch(/Ne note pas teletravail ni remuneration/);
    expect(c).toMatch(/stage = Stage ou alternance → 0/);
  });
});

describe('stockage, versions et renotation', () => {
  let folder: string;
  let db: Database;
  let ids: number[];

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'vigie-emploi-grille-'));
    db = openDatabase(':memory:');
    ids = [];
    for (let i = 0; i < 3; i++) {
      const { offer } = saveOffer(db, 'linkedin', String(500 + i), { title: `Offre ${i}`, remote: ['full remote', '3 j sur site', 'hybride'][i], compensation: ['55-65 K€', 'NC', '450 €/j'][i] }, 'email');
      ids.push(offer.id);
    }
  });

  const writeRubric = (g: unknown) => {
    mkdirSync(join(folder, 'profil'), { recursive: true });
    writeFileSync(pathRubric(folder), JSON.stringify(g), 'utf8');
  };

  it('sans grille : la note à critères est refusée, la note globale reste possible', () => {
    expect(rubricCurrent(db, folder)).toBeNull();
    const load = () => rubricCurrent(db, folder);
    expect(() => scoreOffers(db, [{ id: ids[0], criteria: { technique: { score: 8 } } }], 'cli', { rubric: load })).toThrow(/sans grille/);
    const [r] = scoreOffers(db, [{ id: ids[0], score: 6 }], 'cli', { rubric: load });
    expect(r.score).toBe(6);
    rmSync(folder, { recursive: true, force: true });
  });

  it('fichier → version 1, note calculée, champ note ignoré et signalé, ancienne note figée', () => {
    initializeRubric(db, folder);
    const v = rubricCurrent(db, folder)!;
    expect(v).toMatchObject({ version: 1, author: 'file' });
    expect(JSON.parse(readFileSync(pathRubric(folder), 'utf8'))).toMatchObject({ version: 1, name: "Grille d'exemple" });

    scoreOffers(db, [{ id: ids[2], score: 6, fit: 'ancienne grille' }], 'cli');
    const [r] = scoreOffers(
      db,
      [{ id: ids[0], score: 9, criteria: { technique: { score: 8, justification: 'PHP' }, role: { score: 7 }, interet: { score: 6 }, risque: { score: 7 } }, fit: 'API' }],
      'mcp',
      { rubric: () => rubricCurrent(db, folder) },
    );
    // 8×.35 + 10×.2 (full remote) + 10×.2 (60 K€ ≥ cible haute 60) + 7×.1 + 6×.1 + 7×.05 = 8,45
    expect(r).toMatchObject({ score: 8.5, exact_score: 8.45, rubric_version: 1, status: 'scored' });
    expect(r.warnings?.[0]).toMatch(/« note » \(9\) ignoré/);
    const n = scoresOffer(db, ids[0])[0];
    expect(n).toMatchObject({ score: 8.5, exact_score: 8.45, raw_score: 8.45, rubric_version: '1', fit: 'API' });
    expect(n.breakdown!.criteria).toHaveLength(6);
    expect(scoresOffer(db, ids[2])[0]).toMatchObject({ score: 6, input: null, breakdown: null });
    rmSync(folder, { recursive: true, force: true });
  });

  it('aperçu, enregistrement, renotation instantanée, seuil, historique, restauration', () => {
    initializeRubric(db, folder);
    const load = () => rubricCurrent(db, folder);
    const criteria = { technique: { score: 6 }, role: { score: 6 }, interet: { score: 6 }, risque: { score: 6 } };
    scoreOffers(db, ids.map((id) => ({ id, criteria })), 'cli', { rubric: load });
    const before = ids.map((id) => offerById(db, id)!.score);
    // 0 : 6×.6 + 10×.2 + 10×.2 = 7,6 → 7,5 ; 1 : 3 j sur site, salaire NC → 6×.6 + 3×.2 + 5×.2 = 5,2 → 5 ;
    // 2 : hybride inconnu, 450 €/j ≥ cible 450 → 6×.6 + 5×.2 + 10×.2 = 6,6 → 6,5
    expect(before).toEqual([7.5, 5, 6.5]);

    const g = load()!.rubric;
    const moreRemote = applyChange(g, { weight: { teletravail: 60 }, threshold: 6 });
    const ap = previewRubric(db, moreRemote, g.threshold);
    expect(ap.offers_recalculated).toBe(3);
    expect(ap.changed).toBeGreaterThan(0);
    expect(ids.map((id) => offerById(db, id)!.score)).toEqual(before); // l'aperçu n'écrit rien
    expect(ap.falling.map((c) => c.id)).toContain(ids[1]);

    const r = saveRubric(db, folder, moreRemote, { author: 'interface', summary: 'Télétravail prioritaire' });
    expect(r.version.version).toBe(2);
    expect(r.impact.changed).toBe(ap.changed);
    const after = ids.map((id) => offerById(db, id)!.score);
    expect(after).not.toEqual(before);
    expect(scoresOffer(db, ids[0])[0]).toMatchObject({ rubric_version: '2' });
    expect(scoresOffer(db, ids[0])).toHaveLength(1); // recalcul sur place, pas de nouvelle ligne
    expect(JSON.parse(readFileSync(pathRubric(folder), 'utf8'))).toMatchObject({ version: 2, threshold: 6, summary: 'Télétravail prioritaire' });

    expect(() => saveRubric(db, folder, moreRemote, { author: 'cli', summary: 'nothing' })).toThrow(/Aucun changement/);
    expect(() => saveRubric(db, folder, g, { author: 'cli', summary: ' ' })).toThrow(/Résumé/);

    const m = updateRubric(db, folder, { rules: [{ id: 'stage', active: false }] }, { author: 'mcp', summary: 'dry_run', dry_run: true });
    expect(m).toMatchObject({ saved: false, version: 2 });
    expect(historyRubric(db).map((h) => [h.version, h.author])).toEqual([
      [2, 'interface'],
      [1, 'file'],
    ]);

    const rest = restoreRubric(db, folder, 1, { author: 'cli' });
    expect(rest.version).toMatchObject({ version: 3, summary: 'Retour à la version 1' });
    expect(ids.map((id) => offerById(db, id)!.score)).toEqual(before);
    expect(rescore(db, folder).impact).toMatchObject({ offers_recalculated: 3, changed: 0 });
    rmSync(folder, { recursive: true, force: true });
  });

  it('fichier modifié à la main → nouvelle version ; fichier supprimé → réécrit ; fichier invalide → erreur claire', () => {
    initializeRubric(db, folder);
    scoreOffers(db, [{ id: ids[0], criteria: { technique: { score: 2 } }, blockers: ['stage'] }], 'cli', { rubric: () => rubricCurrent(db, folder) });
    expect(offerById(db, ids[0])!.score).toBe(0);
    const raw = JSON.parse(readFileSync(pathRubric(folder), 'utf8'));
    raw.rules[0].active = false;
    writeRubric(raw);
    const v = rubricCurrent(db, folder)!;
    expect(v).toMatchObject({ version: 2, author: 'file', summary: 'Modifiée dans le fichier grille.json' });
    expect(offerById(db, ids[0])!.score).toBeGreaterThan(0); // renotée : la règle stage est désactivée
    expect(scoresOffer(db, ids[0])[0].breakdown!.ignored_blockers).toEqual(['stage']);

    rmSync(pathRubric(folder));
    expect(rubricCurrent(db, folder)!.version).toBe(2);
    expect(existsSync(pathRubric(folder))).toBe(true);

    writeRubric({ ...raw, threshold: 'high' });
    expect(() => rubricCurrent(db, folder)).toThrow(/Grille invalide.*threshold/);
    rmSync(folder, { recursive: true, force: true });
  });

  it('correction des sous-notes dans l’interface : nouvelle ligne d’historique, origines conservées', () => {
    initializeRubric(db, folder);
    const v = rubricCurrent(db, folder)!;
    scoreOffers(db, [{ id: ids[1], criteria: { technique: { score: 8, justification: 'AI' }, role: { score: 6 } }, fit: 'API' }], 'mcp', { rubric: () => v });
    const r = updateSubScores(db, ids[1], { criteria: { role: { score: 9, justification: 'Vu en entretien' } }, inputs: { onsite_days: 1 } }, 'interface', v);
    const scores = scoresOffer(db, ids[1]);
    expect(scores).toHaveLength(2);
    expect(scores[0]).toMatchObject({ origin: 'interface', fit: 'API' });
    expect(scores[0].input!.criteria).toMatchObject({ technique: { score: 8, origin: 'ai' }, role: { score: 9, origin: 'interface' } });
    const d = scores[0].breakdown!;
    expect(d.criteria.find((c) => c.id === 'role')).toMatchObject({ score: 9, origin: 'interface', justification: 'Vu en entretien' });
    expect(d.criteria.find((c) => c.id === 'teletravail')).toMatchObject({ score: 8 });
    expect(r.score).toBe(d.score);
    rmSync(folder, { recursive: true, force: true });
  });

  it('API : grille, aperçu, enregistrement, historique, restauration, sous-notes', async () => {
    initializeRubric(db, folder);
    const app = createApp(db, { dataDir: folder });
    const send = (path: string, method: string, body?: unknown) =>
      app.request(path, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
    const g = (await (await app.request('/api/rubric')).json()) as { version: number; rubric: Rubric; examples: { score: number }[] };
    expect(g.version).toBe(1);
    expect(g.examples.map((e) => e.score)).toEqual([8, 3.5, 0]);

    const n = await send(`/api/offers/${ids[0]}/sub-scores`, 'PUT', { criteria: { technique: { score: 7, justification: 'à la main' } } });
    expect(((await n.json()) as { scores: { origin: string; breakdown: unknown }[] }).scores[0]).toMatchObject({ origin: 'interface' });

    const modified = applyChange(g.rubric, { threshold: 9 });
    const ap = (await (await send('/api/rubric/preview', 'POST', { rubric: modified })).json()) as { offers_recalculated: number; falling: unknown[] };
    expect(ap.offers_recalculated).toBe(1);
    expect(ap.falling).toHaveLength(1);
    expect((await send('/api/rubric', 'PUT', { rubric: modified, summary: '' })).status).toBe(400);
    const saved = (await (await send('/api/rubric', 'PUT', { rubric: modified, summary: 'Seuil 9' })).json()) as { version: number };
    expect(saved.version).toBe(2);
    const h = (await (await app.request('/api/rubric/history')).json()) as { version: number; author: string }[];
    expect(h.map((x) => [x.version, x.author])).toEqual([
      [2, 'interface'],
      [1, 'file'],
    ]);
    const v1 = (await (await app.request('/api/rubric/versions/1')).json()) as { rubric: Rubric };
    expect(v1.rubric.threshold).toBe(4.5);
    const rest = (await (await send('/api/rubric/restore', 'POST', { version: 1 })).json()) as { version: number };
    expect(rest.version).toBe(3);
    expect((await send('/api/rubric', 'PUT', { rubric: { threshold: 2 }, summary: 'cassée' })).status).toBe(400);
    rmSync(folder, { recursive: true, force: true });
  });
});

describe('règle « plafond si critère faible »', () => {
  const g = validateRubric({
    ...rubricTest(),
    rules: [{ id: 'technique-faible', label: 'Technique insuffisante', effect: 'criterion_cap', criterion: 'technique', threshold: 4 }],
  });

  it('plafonne la note à la sous-note technique quand elle est sous le seuil, sans signalement de l’IA', () => {
    // technique 2 × 50 % + télétravail 10 × 25 % + rémunération 10 × 25 % = 6 → plafonnée à 2
    const d = computeScore(g, { criteria: { technique: { score: 2 } }, inputs: { onsite_days: 0, salary_min: 70000, unit: 'year' }, blockers: [] });
    expect(d.average).toBe(6);
    expect(d.score).toBe(2);
    expect(d.rules).toEqual([expect.objectContaining({ id: 'technique-faible', effect: 'criterion_cap', value: 2, effective: true })]);
  });

  it('ne s’applique ni au-dessus du seuil ni sur une sous-note neutre (critère manquant)', () => {
    expect(computeScore(g, { criteria: { technique: { score: 4 } }, blockers: [] }).rules).toEqual([]);
    expect(computeScore(g, { criteria: {}, blockers: [] }).rules).toEqual([]);
  });

  it('refuse une règle sans critère ni seuil', () => {
    expect(() => validateRubric({ ...rubricTest(), rules: [{ id: 'x', label: 'X', effect: 'criterion_cap' }] })).toThrow();
  });
});
