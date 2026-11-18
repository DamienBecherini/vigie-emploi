// Rubric schema (Zod): criteria, scales, rules, inventory, examples, and the score input given by the AI.
// Also the types inferred from it and the validation of a whole rubric.
import { z } from 'zod';
import { t } from '../../i18n/index.ts';
import { AppError, messageZod } from '../errors.ts';

export const LEVELS = ['strong', 'medium', 'light', 'zero'] as const;
export type Level = (typeof LEVELS)[number];

/** Criteria whose sub-score is computed by the application from a scale. */
export const COMPUTATIONS = ['remote', 'compensation'] as const;
export type Computation = (typeof COMPUTATIONS)[number];

export const UNITS = ['year', 'month', 'day', 'hour'] as const;
export type Unit = (typeof UNITS)[number];

/** Maximum number of weighted criteria (beyond that, the rubric gets hard to read). */
export const CRITERIA_MAX = 7;

export const identifier = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/, { error: () => t('core.rubric.identifier') });
export const score10 = z
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
export const fieldsTier = {
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
    name: z.string().default(() => t('core.rubric.defaultName')),
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
