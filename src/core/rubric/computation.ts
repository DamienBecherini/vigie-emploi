// Score computation: scale-based sub-scores (remote work, compensation), weighted average, blocking rules,
// rounding to the half point. Pure functions, without disk nor database access.
import { decimal, languageCurrent, t } from '../../i18n/index.ts';
import { AppError, messageZod } from '../errors.ts';
import { onsiteDaysFromText } from './remote-text.ts';
import { type Example, type Input, type Rubric, type Scales, schemaInput, type Unit, UNITS } from './schema.ts';

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
  /** Values of the message: the amount under the floor and its kind, the label of the criterion left without a sub-score. */
  params?: Record<string, string | number>;
  /** Scores saved before version 0.7 carry their message, written in French; the newer ones the code and its values only. */
  message?: string;
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
      flag: { code: 'remote_unknown' },
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
      flag: { code: 'compensation_unknown' },
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
    flag: value < floor ? { code: 'sub_floor', params: { amount: rounded(value, 1), unit: type } } : undefined,
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
        flags.push({ code: `criterion_missing:${c.id}`, params: { label: c.label } });
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
  const lines = d.rules.map((r) =>
    t('core.ruleSummary', { effect: r.effect === 'zero' ? '0' : t('core.cap', { value: formatNumber(r.value!) }), label: r.label }),
  );
  return lines.length ? lines.join(' ; ') : null;
}

/** Score of a reference example, computed with the rubric (to display it and calibrate the AI). */
export function scoreExample(rubric: Rubric, e: Example, version: number | null = null): Breakdown {
  return computeScore(rubric, { criteria: e.criteria, inputs: e.inputs, blockers: e.blockers }, {}, version);
}
