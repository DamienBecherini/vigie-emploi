// Scoring rubric: schema (Zod), score computation (pure functions, without disk nor database access)
// and partial change. Shared by the CLI, the API, the MCP server and the interface.
//
// Principle: the AI (or the user) scores a few criteria from 0 to 10 and reports the blocking rules
// that apply; the application computes the scale-based criteria (remote work, compensation), the weighted
// average, applies the rules (zero, cap) and rounds to the half point. The AI never gives the final score.
import { z } from 'zod';
import { decimal, languageCurrent, t, t as tr } from '../i18n/index.ts';
import { AppError, messageZod } from './errors.ts';

export const LEVELS = ['strong', 'medium', 'light', 'zero'] as const;
export type Level = (typeof LEVELS)[number];
export const LABELS_LEVELS: Record<Level, string> = { strong: 'Fort', medium: 'Moyen', light: 'Léger', zero: 'Zéro' };

/** Criteria whose sub-score is computed by the application from a scale. */
export const COMPUTATIONS = ['remote', 'compensation'] as const;
export type Computation = (typeof COMPUTATIONS)[number];

export const UNITS = ['year', 'month', 'day', 'hour'] as const;
export type Unit = (typeof UNITS)[number];

/** Maximum number of weighted criteria (beyond that, the rubric gets hard to read). */
export const CRITERIA_MAX = 7;

const identifier = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/, { error: () => t('core.rubric.identifier') });
const score10 = z
  .number()
  .min(0, { error: () => t('core.rubric.score10') })
  .max(10, { error: () => t('core.rubric.score10') });

export const schemaCriterion = z
  .strictObject({
    id: identifier,
    label: z.string().min(1),
    /** Instruction for the AI (what the criterion measures, what raises or lowers the sub-score). */
    description: z.string().default(''),
    /** ai: sub-score given by the AI; computation: sub-score computed from the "computation" scale. */
    source: z.enum(['ai', 'computation']),
    computation: z.enum(COMPUTATIONS).optional(),
    /** Relative weight (the sum is normalized: 35 + 20 + 20 + 10 + 10 + 5 = 100 %). */
    weight: z.number().min(0).max(100),
  })
  .superRefine((c, ctx) => {
    if (c.source === 'computation' && !c.computation) {
      ctx.addIssue({
        code: 'custom',
        path: ['computation'],
        message: t('core.rubric.computationExpected', { id: c.id, computations: COMPUTATIONS.join(t('core.or')) }),
      });
    }
    if (c.source === 'ai' && c.computation) {
      ctx.addIssue({ code: 'custom', path: ['computation'], message: t('core.rubric.computationReserved', { id: c.id }) });
    }
  });

/** Compensation scale for one unit: floor → 5, high target and beyond → 10, below the floor → 0. */
const fieldsTier = {
  floor: z.number().positive(),
  target_low: z.number().positive(),
  target_high: z.number().positive(),
  /** Floor specific to full remote jobs (optional). */
  floor_full_remote: z.number().positive().optional(),
};
export const schemaTier = z.strictObject(fieldsTier).superRefine((p, ctx) => {
  if (p.target_high <= p.floor) ctx.addIssue({ code: 'custom', path: ['target_high'], message: t('core.rubric.targetHigh') });
  if (p.floor_full_remote !== undefined && p.target_high <= p.floor_full_remote) {
    ctx.addIssue({ code: 'custom', path: ['floor_full_remote'], message: t('core.rubric.targetHighFullRemote') });
  }
  if (p.target_low > p.target_high) ctx.addIssue({ code: 'custom', path: ['target_low'], message: t('core.rubric.targetLow') });
});
export type Tier = z.infer<typeof schemaTier>;

export const schemaScales = z.strictObject({
  remote: z.strictObject({
    /** Sub-score by the number of days on site per week: index 0 (full remote) to 5 (on site). */
    onsite_days: z.array(score10).length(6, { error: () => t('core.rubric.sixValues') }),
    /** Sub-score when the pace is unknown (neutral value, with a flag). */
    unknown: score10.default(5),
  }),
  compensation: z.strictObject({
    /** Value compared with the scale when the offer gives a range. */
    reference: z.enum(['middle', 'min', 'max']).default('middle'),
    unknown: score10.default(5),
    /** Gross annual salary, in K€ (a monthly salary is multiplied by 12). */
    salary: schemaTier,
    /** Daily rate, in € (an hourly rate is multiplied by 7). */
    daily_rate: schemaTier,
  }),
});
export type Scales = z.infer<typeof schemaScales>;

export const schemaRule = z
  .strictObject({
    id: identifier,
    label: z.string().min(1),
    /** When to report it (instruction for the AI). */
    description: z.string().default(''),
    /**
     * zero / cap: applied when the AI reports the rule in "blockers".
     * criterion_cap: applied automatically when the sub-score of "criterion" is below "threshold";
     * the final score is then capped at that sub-score.
     */
    effect: z.enum(['zero', 'cap', 'criterion_cap']),
    /** Maximum score for the "cap" effect. */
    value: score10.optional(),
    /** Watched criterion ("criterion_cap" effect). */
    criterion: z.string().optional(),
    /** Threshold below which the rule applies ("criterion_cap" effect). */
    threshold: score10.optional(),
    active: z.boolean().default(true),
  })
  .superRefine((r, ctx) => {
    if (r.effect === 'cap' && r.value === undefined) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: t('core.rubric.valueCap', { id: r.id }) });
    }
    if (r.effect === 'criterion_cap' && (r.criterion === undefined || r.threshold === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['criterion'], message: t('core.rubric.criterionThreshold', { id: r.id }) });
    }
  });
export type Rule = z.infer<typeof schemaRule>;

export const schemaTechnology = z.strictObject({
  technology: z.string().min(1),
  level: z.enum(LEVELS),
  precision: z.string().optional(),
});
export type Technology = z.infer<typeof schemaTechnology>;

/** Inputs of the computed criteria, read in the offer by the AI (otherwise deduced from the offer's fields). */
export const schemaInputs = z.strictObject({
  onsite_days: z.number().int().min(0).max(5).nullable().optional(),
  salary_min: z.number().positive().nullable().optional(),
  salary_max: z.number().positive().nullable().optional(),
  unit: z.enum(UNITS).nullable().optional(),
});
export type Inputs = z.infer<typeof schemaInputs>;

const subScore = z.strictObject({
  score: z.union([score10, z.string()]).transform((v, ctx) => {
    const n = typeof v === 'number' ? v : Number(v.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 10) {
      ctx.addIssue({ code: 'custom', message: t('core.rubric.subScore', { value: String(v) }) });
      return z.NEVER;
    }
    return n;
  }),
  justification: z.string().optional(),
  /** Who gave it: the AI (by default) or the user in the interface. */
  origin: z.enum(['ai', 'interface']).optional(),
});

/** What the AI (or the interface) provides for a criteria-based score. */
export const schemaInput = z.strictObject({
  criteria: z.record(z.string(), subScore).default({}),
  inputs: schemaInputs.optional(),
  blockers: z.array(z.string()).default([]),
});
export type Input = z.infer<typeof schemaInput>;

export const schemaExample = z.strictObject({
  title: z.string().min(1),
  company: z.string().optional(),
  url: z.string().optional(),
  /** Reminder of the offer's conditions (location, contract, pace, salary) to situate the example. */
  conditions: z.string().optional(),
  criteria: z.record(z.string(), z.strictObject({ score: score10, justification: z.string() })).default({}),
  inputs: schemaInputs.optional(),
  blockers: z.array(z.string()).default([]),
  comment: z.string().default(''),
});
export type Example = z.infer<typeof schemaExample>;

export const schemaRubric = z
  .strictObject({
    name: z.string().default('Grille de notation'),
    /** "Worth a look" threshold: quick view "Scored ≥ …". */
    threshold: score10.default(4.5),
    /** General instructions for the AI (targets, bonuses, what matters), in addition to the criteria descriptions. */
    instructions: z.array(z.string()).default([]),
    criteria: z
      .array(schemaCriterion)
      .min(1)
      .max(CRITERIA_MAX, { error: () => t('core.rubric.criteriaMax', { n: CRITERIA_MAX }) }),
    scales: schemaScales,
    rules: z.array(schemaRule).default([]),
    inventory: z.array(schemaTechnology).default([]),
    examples: z.array(schemaExample).default([]),
  })
  .superRefine((g, ctx) => {
    const duplicates = (ids: string[]) => ids.filter((x, i) => ids.indexOf(x) !== i);
    for (const d of duplicates(g.criteria.map((c) => c.id)))
      ctx.addIssue({ code: 'custom', path: ['criteria'], message: t('core.rubric.criterionDouble', { id: d }) });
    for (const d of duplicates(g.rules.map((r) => r.id))) ctx.addIssue({ code: 'custom', path: ['rules'], message: t('core.rubric.ruleDouble', { id: d }) });
    for (const d of duplicates(g.criteria.flatMap((c) => (c.computation ? [c.computation] : [])))) {
      ctx.addIssue({ code: 'custom', path: ['criteria'], message: t('core.rubric.scaleDouble', { computation: d }) });
    }
    if (!g.criteria.some((c) => c.weight > 0)) ctx.addIssue({ code: 'custom', path: ['criteria'], message: t('core.rubric.oneWeight') });
    const ai = new Set(g.criteria.filter((c) => c.source === 'ai').map((c) => c.id));
    const rules = new Set(g.rules.map((r) => r.id));
    g.examples.forEach((e, i) => {
      for (const k of Object.keys(e.criteria)) {
        if (!ai.has(k))
          ctx.addIssue({ code: 'custom', path: ['examples', i, 'criteria', k], message: t('core.rubric.exampleCriterion', { title: e.title, criterion: k }) });
      }
      for (const b of e.blockers) {
        if (!rules.has(b))
          ctx.addIssue({ code: 'custom', path: ['examples', i, 'blockers'], message: t('core.rubric.exampleRule', { title: e.title, rule: b }) });
      }
    });
  });
export type Rubric = z.infer<typeof schemaRubric>;
export type CriterionRubric = Rubric['criteria'][number];

/** Metadata keys of the grille.json file (outside the versioned content). */
export const META_FILE = ['version', 'modified_at', 'summary', '$schema', '$comment'] as const;

/** Validates a rubric (JSON object); throws an Error with a readable message. */
export function validateRubric(raw: unknown, origin = 'rubric'): Rubric {
  const r = schemaRubric.safeParse(raw);
  if (!r.success) throw new AppError('invalid', t('core.rubric.invalid', { origin, message: messageZod(r.error) }));
  return r.data;
}

// ---------------------------------------------------------------------------------------------
// Calcul

/** Fields of the offer used by the computed criteria (when the AI did not give the inputs). */
export interface DataOffer {
  remote?: string | null;
  compensation_min?: number | null;
  compensation_max?: number | null;
  compensation_unit?: string | null;
}

export type OriginSubScore = 'ai' | 'interface' | 'computation' | 'neutral';

export interface LineCriterion {
  id: string;
  label: string;
  source: 'ai' | 'computation';
  score: number;
  justification: string | null;
  origin: OriginSubScore;
  weight: number;
  /** Weight scaled to 1 (sum of the weights = 1). */
  normalized_weight: number;
  /** Points brought to the average: score × normalized weight. */
  contribution: number;
}

export interface AppliedRule {
  id: string;
  label: string;
  effect: 'zero' | 'cap' | 'criterion_cap';
  value: number | null;
  /** The rule lowered the score (a cap above the average changes nothing). */
  effective: boolean;
}

export interface Flag {
  code: string;
  message: string;
}

export interface InputsUsed {
  onsite_days: number | null;
  days_origin: 'input' | 'offer' | null;
  salary_min: number | null;
  salary_max: number | null;
  unit: Unit | null;
  salary_origin: 'input' | 'offer' | null;
}

export interface Breakdown {
  rubric_version: number | null;
  criteria: LineCriterion[];
  /** Weighted average, before the blocking rules. */
  average: number;
  rules: AppliedRule[];
  /** Rules reported but unknown or disabled in this version of the rubric. */
  ignored_blockers: string[];
  flags: Flag[];
  inputs: InputsUsed;
  /** Score after the rules, not rounded (kept in the database). */
  exact_score: number;
  /** Displayed score: rounded to the half point. */
  score: number;
}

/** Rounded to the nearest half point (4.25 → 4.5; 4.24 → 4). */
export function roundedHalf(x: number): number {
  return Math.round(x * 2 + 1e-9) / 2;
}

function rounded(x: number, decimals = 4): number {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}

/**
 * Interpolation of the compensation scale: below the floor 0; at the floor 5; at the high target
 * and beyond 10; linear in between.
 */
export function interpolate(value: number, floor: number, targetHigh: number): number {
  if (value < floor) return 0;
  if (value >= targetHigh) return 10;
  return 5 + (5 * (value - floor)) / (targetHigh - floor);
}

/**
 * Days on site per week read in a free remote-work text: "full remote" → 0,
 * "3 j sur site" → 3, "2 j de télétravail" → 3, "sur site" → 5; null if the text does not allow a conclusion
 * ("hybride", "télétravail partiel", "NC").
 */
export function onsiteDaysFromText(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ');
  const j = String.raw`(\d)(?:[,.]5)?\s*(?:j\b|jours?\b|jrs?\b)\s*(?:\/|par)?\s*(?:sem\w*)?\s*`;
  let m = t.match(new RegExp(`${j}(?:sur site|au bureau|en presentiel|de presentiel|presentiel|on[- ]?site|dans nos locaux|chez le client)`));
  if (m) return Math.min(5, Number(m[1]));
  m = t.match(new RegExp(`${j}(?:de |en )?(?:teletravail|remote|tt\\b|a distance)`));
  if (m) return Math.max(0, 5 - Number(m[1]));
  if (
    /full[ -]?remote|100 ?% (?:teletravail|remote|a distance)|(?:tout|totalement|entierement) (?:a distance|en teletravail)|teletravail (?:complet|total|integral)|remote total|fully remote|\bremote only\b/.test(
      t,
    )
  ) {
    return 0;
  }
  if (/^\s*(?:a distance|remote|teletravail)\s*$/.test(t)) return 0;
  if (/(?:100 ?% )?(?:sur site|presentiel|on[- ]?site)|pas de teletravail|sans teletravail|aucun teletravail/.test(t)) return 5;
  return null;
}

/** Amount brought to the unit of the scale: K€/year for a salary, €/day for a rate. */
function toScale(v: number, unit: Unit): { value: number; type: 'salary' | 'daily_rate' } {
  switch (unit) {
    case 'year':
      return { value: v >= 1000 ? v / 1000 : v, type: 'salary' };
    case 'month':
      return { value: (v * 12) / 1000, type: 'salary' };
    case 'day':
      return { value: v, type: 'daily_rate' };
    case 'hour':
      return { value: v * 7, type: 'daily_rate' };
  }
}

function formatNumber(n: number): string {
  return decimal(rounded(n, 1), languageCurrent(), 1);
}

export interface ResultComputation {
  score: number;
  justification: string;
  flag?: Flag;
}

export function scoreRemote(b: Scales['remote'], days: number | null): ResultComputation {
  if (days === null) {
    return {
      score: b.unknown,
      justification: t('core.calc.paceUnknown'),
      flag: { code: 'remote_unknown', message: 'Télétravail inconnu (valeur neutre) : à vérifier' },
    };
  }
  const n = b.onsite_days[Math.min(5, Math.max(0, Math.round(days)))];
  return { score: n, justification: days === 0 ? t('core.calc.fullRemote') : t('core.calc.onsiteDays', { n: days }) };
}

export function scoreCompensation(
  b: Scales['compensation'],
  r: { min: number | null; max: number | null; unit: Unit | null },
  days: number | null,
): ResultComputation {
  const values = [r.min, r.max].filter((v): v is number => v !== null && Number.isFinite(v) && v > 0);
  if (!values.length || !r.unit) {
    return {
      score: b.unknown,
      justification: t('core.calc.compensationUnknown'),
      flag: { code: 'compensation_unknown', message: 'Rémunération inconnue (valeur neutre) : à demander' },
    };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const raw = b.reference === 'min' ? min : b.reference === 'max' ? max : (min + max) / 2;
  const { value, type } = toScale(raw, r.unit);
  const p = type === 'salary' ? b.salary : b.daily_rate;
  const fullRemote = days === 0 && p.floor_full_remote !== undefined;
  const floor = fullRemote ? p.floor_full_remote! : p.floor;
  const score = interpolate(value, floor, p.target_high);
  const u = type === 'salary' ? t('core.calc.unitSalary') : t('core.calc.unitTjm');
  const ref = values.length > 1 && min !== max ? ` (${b.reference === 'middle' ? t('core.calc.middle') : b.reference})` : '';
  const position =
    value < floor
      ? t('core.calc.subFloor', { floor: `${formatNumber(floor)}${u}` })
      : value >= p.target_high
        ? t('core.calc.targetHigh', { target: `${formatNumber(p.target_high)}${u}` })
        : t('core.calc.between', { floor: formatNumber(floor), target: `${formatNumber(p.target_high)}${u}` });
  return {
    score,
    justification: `${formatNumber(value)}${u}${ref}, ${position}${fullRemote ? t('core.calc.floorFullRemote') : ''}`,
    flag: value < floor ? { code: 'sub_floor', message: `Rémunération sous le plancher (${formatNumber(value)}${u}) : à signaler` } : undefined,
  };
}

/** Inputs of the computed criteria: those of the input first, otherwise the offer's fields. */
export function inputsUsed(input: Input, offer: DataOffer): InputsUsed {
  const e = input.inputs ?? {};
  const daysEntered = e.onsite_days ?? null;
  const daysOffer = daysEntered === null ? onsiteDaysFromText(offer.remote) : null;
  const salaryEntered = (e.salary_min ?? e.salary_max ?? null) !== null;
  const unitOffer = (UNITS as readonly string[]).includes(offer.compensation_unit ?? '') ? (offer.compensation_unit as Unit) : null;
  const salaryOffer = !salaryEntered && (offer.compensation_min ?? offer.compensation_max ?? null) !== null && unitOffer !== null;
  return {
    onsite_days: daysEntered ?? daysOffer,
    days_origin: daysEntered !== null ? 'input' : daysOffer !== null ? 'offer' : null,
    salary_min: salaryEntered ? (e.salary_min ?? e.salary_max ?? null) : salaryOffer ? (offer.compensation_min ?? offer.compensation_max ?? null) : null,
    salary_max: salaryEntered ? (e.salary_max ?? e.salary_min ?? null) : salaryOffer ? (offer.compensation_max ?? offer.compensation_min ?? null) : null,
    unit: salaryEntered ? (e.unit ?? 'year') : salaryOffer ? unitOffer : null,
    salary_origin: salaryEntered ? 'input' : salaryOffer ? 'offer' : null,
  };
}

/**
 * Computes the score of an offer: sub-scores (AI or scale), normalized weighted average, blocking rules
 * (zero, cap), rounding to the half point. Tolerant: a missing AI criterion gets the neutral value 5 with a
 * flag, an unknown or disabled rule is ignored (listed). To validate a new input,
 * see checkInput.
 */
export function computeScore(rubric: Rubric, input: Input, offer: DataOffer = {}, version: number | null = null): Breakdown {
  const inputs = inputsUsed(input, offer);
  const flags: Flag[] = [];
  const sum = rubric.criteria.reduce((s, c) => s + c.weight, 0);
  const criteria: LineCriterion[] = rubric.criteria.map((c) => {
    let score: number;
    let justification: string | null;
    let origin: OriginSubScore;
    if (c.source === 'computation') {
      const r =
        c.computation === 'remote'
          ? scoreRemote(rubric.scales.remote, inputs.onsite_days)
          : scoreCompensation(rubric.scales.compensation, { min: inputs.salary_min, max: inputs.salary_max, unit: inputs.unit }, inputs.onsite_days);
      score = r.score;
      justification = r.justification;
      origin = r.flag && r.flag.code !== 'sub_floor' ? 'neutral' : 'computation';
      if (r.flag) flags.push(r.flag);
    } else {
      const s = input.criteria[c.id];
      if (s) {
        score = s.score;
        justification = s.justification?.trim() || null;
        origin = s.origin === 'interface' ? 'interface' : 'ai';
      } else {
        score = 5;
        justification = null;
        origin = 'neutral';
        flags.push({ code: `criterion_missing:${c.id}`, message: `${c.label} : pas de sous-note (valeur neutre 5)` });
      }
    }
    const normalizedWeight = sum > 0 ? c.weight / sum : 0;
    return {
      id: c.id,
      label: c.label,
      source: c.source,
      score: rounded(score),
      justification,
      origin,
      weight: c.weight,
      normalized_weight: rounded(normalizedWeight, 6),
      contribution: rounded(score * normalizedWeight),
    };
  });
  const average = rounded(criteria.reduce((s, c) => s + c.score * (sum > 0 ? c.weight / sum : 0), 0));
  let exactScore = average;
  const rules: AppliedRule[] = [];
  const ignored: string[] = [];
  for (const id of [...new Set(input.blockers)]) {
    const r = rubric.rules.find((x) => x.id === id);
    if (!r?.active) {
      ignored.push(id);
      continue;
    }
    const before = exactScore;
    if (r.effect === 'zero') exactScore = 0;
    else exactScore = Math.min(exactScore, r.value!);
    rules.push({ id: r.id, label: r.label, effect: r.effect, value: r.effect === 'cap' ? r.value! : null, effective: exactScore < before });
  }
  for (const r of rubric.rules) {
    if (!r.active || r.effect !== 'criterion_cap') continue;
    const c = criteria.find((x) => x.id === r.criterion);
    if (!c || c.origin === 'neutral' || c.score >= r.threshold!) continue;
    const before = exactScore;
    exactScore = Math.min(exactScore, c.score);
    rules.push({ id: r.id, label: r.label, effect: r.effect, value: c.score, effective: exactScore < before });
  }
  exactScore = rounded(exactScore);
  return {
    rubric_version: version,
    criteria,
    average,
    rules,
    ignored_blockers: ignored,
    flags,
    inputs,
    exact_score: exactScore,
    score: roundedHalf(exactScore),
  };
}

/**
 * Validates a new input against the rubric: criteria known and scored by the AI, known rules.
 * Throws an Error with a message useful to the AI (list of the expected ids).
 */
export function checkInput(rubric: Rubric, raw: unknown): Input {
  const r = schemaInput.safeParse(raw);
  if (!r.success) throw new AppError('invalid', t('core.input.invalid', { message: messageZod(r.error) }));
  const s = r.data;
  const ai = rubric.criteria.filter((c) => c.source === 'ai').map((c) => c.id);
  for (const k of Object.keys(s.criteria)) {
    const c = rubric.criteria.find((x) => x.id === k);
    if (!c) throw new AppError('invalid', t('core.input.criterionUnknown', { id: k, list: ai.join(', ') }));
    if (c.source === 'computation') {
      throw new AppError(
        'invalid',
        t('core.input.criterionComputed', {
          id: k,
          fields: c.computation === 'remote' ? 'inputs.onsite_days' : 'inputs.salary_min / salary_max / unit',
        }),
      );
    }
  }
  const rules = rubric.rules.map((x) => x.id);
  for (const b of s.blockers) {
    if (!rules.includes(b)) throw new AppError('invalid', t('core.input.ruleUnknown', { id: b, list: rules.join(', ') || t('core.noneFeminine') }));
  }
  return s;
}

/** Short label of the applied rules, for the "penalties" column of the scores. */
export function summaryRules(d: Breakdown): string | null {
  const t = d.rules.map((r) => `${r.effect === 'zero' ? '0' : `plafond ${formatNumber(r.value!)}`} : ${r.label}`);
  return t.length ? t.join(' ; ') : null;
}

/** Score of a reference example, computed with the rubric (to display it and calibrate the AI). */
export function scoreExample(rubric: Rubric, e: Example, version: number | null = null): Breakdown {
  return computeScore(rubric, { criteria: e.criteria, inputs: e.inputs, blockers: e.blockers }, {}, version);
}

// ---------------------------------------------------------------------------------------------
// Modification partielle (MCP modifier_grille, CLI grille --modifier)

export const schemaChange = z.strictObject({
  weight: z.record(z.string(), z.number().min(0).max(100)).optional(),
  threshold: score10.optional(),
  name: z.string().optional(),
  instructions: z.array(z.string()).optional(),
  scales: z
    .strictObject({
      remote: schemaScales.shape.remote.partial().optional(),
      compensation: z
        .strictObject({
          reference: z.enum(['middle', 'min', 'max']).optional(),
          unknown: score10.optional(),
          salary: z.strictObject(fieldsTier).partial().optional(),
          daily_rate: z.strictObject(fieldsTier).partial().optional(),
        })
        .optional(),
    })
    .optional(),
  /** Rules: addition (new id) or update of the given fields (existing id). */
  rules: z
    .array(
      z.strictObject({
        id: identifier,
        label: z.string().optional(),
        description: z.string().optional(),
        effect: z.enum(['zero', 'cap', 'criterion_cap']).optional(),
        value: score10.nullable().optional(),
        criterion: z.string().optional(),
        threshold: score10.optional(),
        active: z.boolean().optional(),
      }),
    )
    .optional(),
  remove_rules: z.array(z.string()).optional().describe('Identifiants des règles à retirer ; les règles non citées dans « regles » restent telles quelles'),
  /** Criteria: update of the given fields (label, description, weight). */
  criteria: z
    .array(z.strictObject({ id: z.string(), label: z.string().optional(), description: z.string().optional(), weight: z.number().min(0).max(100).optional() }))
    .optional(),
  inventory: z
    .strictObject({
      /** Adds or replaces (same technology, case-insensitive). */
      add: z.array(schemaTechnology).optional(),
      remove: z.array(z.string()).optional(),
    })
    .optional(),
  /** Reference examples: addition or replacement (same title and same company, case-insensitive), removal by title. */
  examples: z
    .strictObject({
      add: z.array(schemaExample).optional(),
      remove: z
        .array(z.union([z.string(), z.strictObject({ title: z.string(), company: z.string().optional() })]))
        .optional()
        .describe('Titres des exemples à retirer, ou { titre, entreprise } si deux exemples ont le même titre'),
    })
    .optional(),
});
export type Change = z.infer<typeof schemaChange>;

/** Applies a partial change to a rubric and returns the new validated rubric. */
export function applyChange(rubric: Rubric, raw: unknown): Rubric {
  const r = schemaChange.safeParse(raw);
  if (!r.success) throw new AppError('invalid', t('core.change.invalid', { message: messageZod(r.error) }));
  const ch = r.data;
  const g = structuredClone(rubric) as Rubric;
  if (ch.name !== undefined) g.name = ch.name;
  if (ch.threshold !== undefined) g.threshold = ch.threshold;
  if (ch.instructions !== undefined) g.instructions = ch.instructions;
  for (const [id, p] of Object.entries(ch.weight ?? {})) {
    const c = g.criteria.find((x) => x.id === id);
    if (!c) throw new AppError('invalid', t('core.change.criterionUnknownList', { id, list: g.criteria.map((x) => x.id).join(', ') }));
    c.weight = p;
  }
  for (const m of ch.criteria ?? []) {
    const c = g.criteria.find((x) => x.id === m.id);
    if (!c) throw new AppError('invalid', t('core.change.criterionUnknown', { id: m.id }));
    if (m.label !== undefined) c.label = m.label;
    if (m.description !== undefined) c.description = m.description;
    if (m.weight !== undefined) c.weight = m.weight;
  }
  if (ch.scales?.remote) Object.assign(g.scales.remote, ch.scales.remote);
  const rem = ch.scales?.compensation;
  if (rem) {
    if (rem.reference !== undefined) g.scales.compensation.reference = rem.reference;
    if (rem.unknown !== undefined) g.scales.compensation.unknown = rem.unknown;
    if (rem.salary) Object.assign(g.scales.compensation.salary, rem.salary);
    if (rem.daily_rate) Object.assign(g.scales.compensation.daily_rate, rem.daily_rate);
  }
  for (const m of ch.rules ?? []) {
    const r0 = g.rules.find((x) => x.id === m.id);
    if (r0) {
      if (m.label !== undefined) r0.label = m.label;
      if (m.description !== undefined) r0.description = m.description;
      if (m.effect !== undefined) r0.effect = m.effect;
      if (m.value !== undefined) {
        if (m.value === null) delete r0.value;
        else r0.value = m.value;
      }
      if (m.criterion !== undefined) r0.criterion = m.criterion;
      if (m.threshold !== undefined) r0.threshold = m.threshold;
      if (m.active !== undefined) r0.active = m.active;
    } else {
      if (!m.label || !m.effect) throw new AppError('invalid', t('core.change.newRule', { id: m.id }));
      g.rules.push({
        id: m.id,
        label: m.label,
        description: m.description ?? '',
        effect: m.effect,
        value: m.value ?? undefined,
        criterion: m.criterion,
        threshold: m.threshold,
        active: m.active ?? true,
      });
    }
  }
  for (const id of ch.remove_rules ?? []) {
    if (!g.rules.some((x) => x.id === id)) throw new AppError('invalid', t('core.change.ruleUnknown', { id }));
    g.rules = g.rules.filter((x) => x.id !== id);
    for (const e of g.examples) e.blockers = e.blockers.filter((b) => b !== id);
  }
  const key = (s: string) => s.trim().toLowerCase();
  // Removals first, additions next: a technology removed then added in the same change
  // is replaced, never lost (the additions of a call cannot be erased by its removals).
  for (const t of ch.inventory?.remove ?? []) {
    const before = g.inventory.length;
    g.inventory = g.inventory.filter((x) => key(x.technology) !== key(t));
    if (g.inventory.length === before) throw new AppError('invalid', tr('core.change.technologyMissing', { technology: t }));
  }
  for (const t of ch.inventory?.add ?? []) {
    const i = g.inventory.findIndex((x) => key(x.technology) === key(t.technology));
    if (i >= 0) g.inventory[i] = t;
    else g.inventory.push(t);
  }
  // Examples: same logic (removals, then additions or replacements).
  const sameExample = (e: Example, title: string, company: string | undefined) =>
    key(e.title) === key(title) && (company === undefined || key(e.company ?? '') === key(company));
  for (const x of ch.examples?.remove ?? []) {
    const { title, company } = typeof x === 'string' ? { title: x, company: undefined } : x;
    const found = g.examples.filter((e) => sameExample(e, title, company));
    if (!found.length)
      throw new AppError('invalid', t('core.change.exampleAbsent', { title, list: g.examples.map((e) => e.title).join(' ; ') || t('core.none') }));
    if (found.length > 1) throw new AppError('invalid', t('core.change.examplesHomonyms', { title }));
    g.examples = g.examples.filter((e) => e !== found[0]);
  }
  for (const e of ch.examples?.add ?? []) {
    const i = g.examples.findIndex((x) => key(x.title) === key(e.title) && key(x.company ?? '') === key(e.company ?? ''));
    if (i >= 0) g.examples[i] = e;
    else g.examples.push(e);
  }
  return validateRubric(g, t('core.rubric.afterChange'));
}

export interface ExampleComputed {
  title: string;
  company: string | null;
  score: number;
  average: number;
  /** Score with the rubric from before the change (null: example added by the change). */
  before?: number | null;
  /** Weighted average before the change (the score, rounded to the half point, may not move). */
  average_before?: number | null;
}

/** Scores of the reference examples with a rubric; with `before`, the score of each example with the old rubric. */
export function computedExamples(g: Rubric, version: number | null, before?: { rubric: Rubric; version: number | null }): ExampleComputed[] {
  const keyEx = (e: Example) => `${e.title.trim().toLowerCase()}|${(e.company ?? '').trim().toLowerCase()}`;
  return g.examples.map((e) => {
    const d = scoreExample(g, e, version);
    const r: ExampleComputed = { title: e.title, company: e.company ?? null, score: d.score, average: d.average };
    if (before) {
      const old = before.rubric.examples.find((x) => keyEx(x) === keyEx(e));
      const da = old ? scoreExample(before.rubric, old, before.version) : null;
      r.before = da?.score ?? null;
      r.average_before = da?.average ?? null;
    }
    return r;
  });
}

// ---------------------------------------------------------------------------------------------
// Instructions for the AI (MCP tool "rubric", command "rubric")

/** Scoring instructions generated from the rubric: what the AI must provide, and how. */
export function instructionsAi(g: Rubric): string[] {
  const ai = g.criteria.filter((c) => c.source === 'ai');
  const calc = g.criteria.filter((c) => c.source === 'computation');
  const sum = g.criteria.reduce((s, c) => s + c.weight, 0) || 1;
  const pct = (p: number) => t('core.pages.percent', { pc: Math.round((p / sum) * 100) });
  return [
    t('core.instructions.scoreFinale'),
    t('core.instructions.criteria', { list: ai.map((c) => `${c.id} (${c.label}, ${pct(c.weight)})`).join(' ; ') }),
    t('core.instructions.computed', { n: calc.length, list: calc.map((c) => c.id).join(t('core.ni')) }) + t('core.instructions.inputs'),
    t('core.instructions.blockers', {
      list:
        g.rules
          .filter((r) => r.active && r.effect !== 'criterion_cap')
          .map((r) => `${r.id} = ${r.label} → ${r.effect === 'zero' ? '0' : t('core.cap', { value: decimal(r.value ?? 0) })}`)
          .join(' ; ') || t('core.noneFeminine'),
    }),
    t('core.instructions.technique'),
    t('core.instructions.examples'),
    t('core.instructions.threshold', { threshold: decimal(g.threshold) }),
  ];
}
