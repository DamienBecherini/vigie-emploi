// Saving of a score in the batch format ({source, url, title, …, raw_score, penalties, score, fit, gaps, read}).
// With "criteria" (and / or "inputs", "blockers"), the score is computed with the scoring rubric:
// the "score" field possibly given is then ignored (reported in "warnings").
import type { Database } from '../db/database.ts';
import { canonicalize } from './links.ts';
import { addScore, addStatus, saveOffer, offerById, type Origin } from './offers.ts';
import { STATUSES_TO_PROCESS } from './statuses.ts';
import { dateFr, dateIso, fingerprint, isEmpty } from './text.ts';
import { z } from 'zod';
import { computeScore, summaryRules, checkInput, messageZod, UNITS, type Breakdown } from './rubric.ts';
import type { VersionRubric } from './rubric-storage.ts';
import { decimal, t } from '../i18n/index.ts';
import { AppError } from './errors.ts';

/** Text a front end attaches to a field of a schema: the MCP server describes each field to the AI. */
export type Describe = (field: string) => string | undefined;

/**
 * A score in the batch format: the one definition of what the command line, the API and the MCP server accept.
 * `describe` gives the documentation of a field ("criteria", "criteria.score", "inputs.unit"…), for the front ends
 * that publish the schema. A text field may be null (an AI often writes null for what the offer does not say).
 */
export function schemaInputBatch(describe: Describe = () => undefined) {
  const doc = <T extends z.ZodType>(schema: T, field: string): T => {
    const text = describe(field);
    return text ? (schema.describe(text) as T) : schema;
  };
  const text = (field: string) => doc(z.string().nullable().optional(), field);
  const score = (field: string) =>
    doc(
      z
        .union([z.number().min(0).max(10), z.string()])
        .nullable()
        .optional(),
      field,
    );
  return z.object({
    id: doc(z.number().int().positive().optional(), 'id'),
    url: text('url'),
    source: text('source'),
    title: text('title'),
    company: text('company'),
    location: text('location'),
    contract: text('contract'),
    compensation: text('compensation'),
    remote: text('remote'),
    published: text('published'),
    stack: text('stack'),
    description: text('description'),
    /** Sub-scores of the criteria scored by the AI: { technique: { score: 8, justification: "…" }, … }. */
    criteria: doc(
      z
        .record(
          z.string(),
          z.object({
            score: doc(z.union([z.number().min(0).max(10), z.string()]), 'criteria.score'),
            justification: doc(z.string().optional(), 'criteria.justification'),
          }),
        )
        .optional(),
      'criteria',
    ),
    /** Inputs of the computed criteria (days on site, salary), when the offer gives them. */
    inputs: doc(
      z
        .object({
          onsite_days: doc(z.number().int().min(0).max(5).nullable().optional(), 'inputs.onsite_days'),
          salary_min: doc(z.number().positive().nullable().optional(), 'inputs.salary_min'),
          salary_max: doc(z.number().positive().nullable().optional(), 'inputs.salary_max'),
          unit: doc(z.enum(UNITS).nullable().optional(), 'inputs.unit'),
        })
        .optional(),
      'inputs',
    ),
    /** Ids of the blocking rules that apply (stage, defense…). */
    blockers: doc(z.array(z.string()).optional(), 'blockers'),
    score: score('score'),
    raw_score: score('raw_score'),
    penalties: text('penalties'),
    fit: text('fit'),
    gaps: text('gaps'),
    read: doc(z.boolean().optional(), 'read'),
    tags: doc(z.array(z.string()).optional(), 'tags'),
  });
}

/** What a front end receives (validated by schemaInputBatch). */
export type InputBatchReceived = z.infer<ReturnType<typeof schemaInputBatch>>;

/**
 * A score as the application handles it: what was received, plus what only the application writes:
 * the version of the old rubric (batches imported from an earlier history) and who gave each sub-score
 * (a correction typed in the dashboard).
 */
export type InputBatch = Omit<InputBatchReceived, 'criteria'> & {
  rubric_version?: string | null;
  criteria?: Record<string, { score: number | string; justification?: string; origin?: 'ai' | 'interface' }>;
};

const SCHEMA_INPUT_BATCH = schemaInputBatch();

/** Validates a score received from outside (command line, API); throws an error that names the wrong field. */
export function checkInputBatch(raw: unknown): InputBatchReceived {
  const r = SCHEMA_INPUT_BATCH.safeParse(raw);
  if (!r.success) throw new AppError('invalid', t('core.input.invalid', { message: messageZod(r.error) }));
  return r.data;
}

/** The input is a criteria-based score (new rubric) rather than an overall score. */
export function isCriteriaScore(e: InputBatch): boolean {
  return e.criteria !== undefined || e.inputs !== undefined || e.blockers !== undefined;
}

export interface ResultScoring {
  id: number;
  created: boolean;
  score_added: boolean;
  score: number | null;
  status: string;
  /** Criteria-based score: rubric version, exact value, breakdown. */
  rubric_version?: number;
  exact_score?: number;
  breakdown?: Breakdown;
  /** Ignored fields, missing criteria… */
  warnings?: string[];
}

function datePublished(v: string | null | undefined): string | null {
  if (!v || isEmpty(v)) return null;
  return dateFr(v) ?? dateIso(v);
}

/** Finds (or creates) the offer of a batch input: by id, otherwise by canonical URL. */
export function offerForInput(
  db: Database,
  e: InputBatch,
  origin: Origin,
  opts: { create?: boolean; receivedAt?: string | null } = {},
): { id: number; created: boolean } | null {
  // Fields of the input: they fill in those missing in the database (never overwriting), whether the offer
  // is designated by its id or by its URL.
  const fields = {
    title: e.title,
    company: e.company,
    location: e.location,
    contract: e.contract,
    compensation: e.compensation,
    remote: e.remote,
    published_at: datePublished(e.published),
    stack: e.stack,
    description: e.description,
  };
  if (e.id !== undefined) {
    const o = offerById(db, Number(e.id));
    if (!o) throw new AppError('not-found', t('core.offerNotFound', { id: e.id }));
    saveOffer(db, o.source, o.site_id, fields, origin);
    return { id: o.id, created: false };
  }
  if (!e.url) throw new AppError('invalid', t('core.inputWithoutId'));
  // Same rule as updateLink: only http(s) addresses (the link is clickable in the dashboard).
  if (!/^https?:\/\/\S+$/i.test(e.url)) throw new AppError('invalid', t('core.linkInvalid', { link: e.url }));
  const ident = canonicalize(e.url);
  const source = ident?.source ?? (e.source || 'manual');
  const siteId = ident?.siteId ?? `url-${fingerprint(e.url)}`;
  const existing = db.prepare('SELECT id FROM offers WHERE source = ? AND site_id = ?').get(source, siteId) as { id: number } | undefined;
  if (!existing && opts.create === false) return null;
  const { offer, created } = saveOffer(db, source, siteId, { ...fields, canonical_url: ident?.url ?? e.url, received_at: opts.receivedAt ?? null }, origin);
  return { id: offer.id, created };
}

/**
 * Scores an offer: fills in its empty fields, adds the score (history) and moves the offer to "scored"
 * if it was still to process.
 */
export function scoreInput(
  db: Database,
  e: InputBatch,
  opts: {
    origin?: string;
    originOffer?: Origin;
    at?: string;
    ifMissing?: boolean;
    receivedAt?: string | null;
    /** Current rubric, required for a criteria-based score. */
    rubric?: VersionRubric | null;
  } = {},
): ResultScoring {
  const origin = opts.origin ?? 'cli';
  const hasCriteria = isCriteriaScore(e);
  const rubric = opts.rubric ?? null;
  if (hasCriteria && !rubric) {
    throw new AppError('invalid', t('core.withoutRubric'));
  }
  const input = hasCriteria ? checkInput(rubric!.rubric, { criteria: e.criteria, inputs: e.inputs, blockers: e.blockers }) : null;
  const target = offerForInput(db, e, opts.originOffer ?? 'manual', { receivedAt: opts.receivedAt })!;
  let breakdown: Breakdown | undefined;
  const warnings: string[] = [];
  let scoreAdded: boolean;
  if (input && rubric) {
    if (origin === 'interface') for (const c of Object.values(input.criteria)) c.origin ??= 'interface';
    breakdown = computeScore(rubric.rubric, input, offerById(db, target.id)!, rubric.version);
    if (e.score !== undefined && e.score !== null && e.score !== '') {
      warnings.push(t('core.scoreIgnored', { score: String(e.score), version: rubric.version, computed: decimal(breakdown.score) }));
    }
    if (e.raw_score !== undefined && e.raw_score !== null) warnings.push(t('core.rawScoreIgnored'));
    if (e.penalties) warnings.push(t('core.penaltiesIgnored'));
    for (const d of breakdown.flags) if (d.code.startsWith('criterion_missing')) warnings.push(d.message);
    scoreAdded = addScore(
      db,
      target.id,
      {
        score: breakdown.score,
        exact_score: breakdown.exact_score,
        raw_score: breakdown.average,
        penalties: summaryRules(breakdown),
        fit: e.fit,
        gaps: e.gaps,
        read: e.read ?? false,
        rubric_version: String(rubric.version),
        input,
        breakdown,
      },
      { origin, at: opts.at, ifMissing: opts.ifMissing },
    );
  } else {
    scoreAdded = addScore(
      db,
      target.id,
      {
        raw_score: e.raw_score === undefined || e.raw_score === null ? null : Number(String(e.raw_score).replace(',', '.')),
        penalties: e.penalties,
        score: e.score === undefined || e.score === null ? null : Number(String(e.score).replace(',', '.')),
        fit: e.fit,
        gaps: e.gaps,
        read: e.read ?? false,
        rubric_version: e.rubric_version,
      },
      { origin, at: opts.at, ifMissing: opts.ifMissing },
    );
  }
  const offer = offerById(db, target.id)!;
  if ((STATUSES_TO_PROCESS as string[]).includes(offer.status)) {
    addStatus(db, target.id, 'scored', { origin, at: opts.at, ifMissing: opts.ifMissing });
  }
  const final = offerById(db, target.id)!;
  const r: ResultScoring = { id: target.id, created: target.created, score_added: scoreAdded, score: final.score, status: final.status };
  if (breakdown) {
    r.rubric_version = rubric!.version;
    r.exact_score = breakdown.exact_score;
    r.breakdown = breakdown;
  }
  if (warnings.length) r.warnings = warnings;
  return r;
}

/** Normalizes the content of a batch file: array, single object or { offers: [...] }. */
export function batchInputs(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    const o = json as { offers?: unknown };
    if (Array.isArray(o.offers)) return o.offers;
    return [json];
  }
  throw new AppError('invalid', t('core.batchUnreadable'));
}
