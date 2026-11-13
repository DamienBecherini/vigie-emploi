// Saving of a score in the batch format ({source, url, title, …, raw_score, penalties, score, fit, gaps, read}).
// With "criteria" (and / or "inputs", "blockers"), the score is computed with the scoring rubric:
// the "score" field possibly given is then ignored (reported in "warnings").
import type { Database } from '../db/database.ts';
import { canonicalize } from './links.ts';
import { addScore, addStatus, saveOffer, offerById, type Origin } from './offers.ts';
import { STATUSES_TO_PROCESS } from './statuses.ts';
import { dateFr, dateIso, fingerprint, isEmpty } from './text.ts';
import { computeScore, summaryRules, checkInput, type Breakdown, type Inputs } from './rubric.ts';
import type { VersionRubric } from './rubric-storage.ts';
import { decimal, t } from '../i18n/index.ts';

export interface InputBatch {
  id?: number;
  source?: string;
  url?: string;
  title?: string;
  company?: string;
  location?: string;
  contract?: string;
  compensation?: string;
  remote?: string;
  published?: string;
  stack?: string;
  description?: string;
  raw_score?: number | string | null;
  penalties?: string;
  score?: number | string | null;
  fit?: string;
  gaps?: string;
  read?: boolean;
  rubric_version?: string;
  tags?: string[];
  /** Sub-scores of the criteria scored by the AI: { technique: { score: 8, justification: "…" }, … }. */
  criteria?: Record<string, { score: number | string; justification?: string; origin?: 'ai' | 'interface' }>;
  /** Inputs of the computed criteria (days on site, salary), when the offer gives them. */
  inputs?: Inputs;
  /** Ids of the blocking rules that apply (stage, defense…). */
  blockers?: string[];
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

function datePublished(v: string | undefined): string | null {
  if (!v || isEmpty(v)) return null;
  return dateFr(v) ?? dateIso(v);
}

/** Finds (or creates) the offer of a batch input: by id, otherwise by canonical URL. */
export function offerOfInput(
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
    if (!o) throw new Error(t('core.offerNotFound', { id: e.id }));
    saveOffer(db, o.source, o.site_id, fields, origin);
    return { id: o.id, created: false };
  }
  if (!e.url) throw new Error(t('core.inputWithoutId'));
  const ident = canonicalize(e.url);
  const source = ident?.source ?? (e.source || 'manual');
  const siteId = ident?.siteId ?? `url-${fingerprint(e.url)}`;
  const existing = db.prepare('SELECT id FROM offers WHERE source = ? AND site_id = ?').get(source, siteId) as
    | { id: number }
    | undefined;
  if (!existing && opts.create === false) return null;
  const { offer, created } = saveOffer(
    db,
    source,
    siteId,
    { ...fields, canonical_url: ident?.url ?? e.url, received_at: opts.receivedAt ?? null },
    origin,
  );
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
    throw new Error(t('core.withoutRubric'));
  }
  const input = hasCriteria ? checkInput(rubric!.rubric, { criteria: e.criteria, inputs: e.inputs, blockers: e.blockers }) : null;
  const target = offerOfInput(db, e, opts.originOffer ?? 'manual', { receivedAt: opts.receivedAt })!;
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
export function inputsOfBatch(json: unknown): InputBatch[] {
  if (Array.isArray(json)) return json as InputBatch[];
  if (json && typeof json === 'object') {
    const o = json as { offers?: unknown };
    if (Array.isArray(o.offers)) return o.offers as InputBatch[];
    return [json as InputBatch];
  }
  throw new Error(t('core.batchUnreadable'));
}
