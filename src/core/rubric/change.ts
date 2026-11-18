// Partial change of a rubric (MCP tool update_rubric, command "rubric --update") and the scores of the reference
// examples before and after a change.
import { z } from 'zod';
import { t, t as tr } from '../../i18n/index.ts';
import { AppError, messageZod } from '../errors.ts';
import { scoreExample } from './computation.ts';
import { type Example, fieldsTier, identifier, type Rubric, schemaExample, schemaScales, schemaTechnology, score10, validateRubric } from './schema.ts';

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
  remove_rules: z.array(z.string()).optional().describe('Ids of the rules to remove; the rules not named in "rules" stay as they are'),
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
        .describe('Titles of the examples to remove, or { title, company } when two examples have the same title'),
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
