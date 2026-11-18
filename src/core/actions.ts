// High-level operations shared by the CLI, the dashboard API and the MCP server.
// Each function validates its inputs and throws an Error with a message the user can read.
import type { Database } from '../db/database.ts';
import { transaction } from '../db/database.ts';
import { listOffers } from './queries.ts';
import { addStatus, detailOffer, saveApplication, updateTags, offerById, type FieldsApplication, type DetailOffer, type Offer } from './offers.ts';
import { checkInputBatch, isCriteriaScore, scoreInput, type InputBatch, type ResultScoring } from './scoring.ts';
import { scoresOffer } from './offers.ts';
import type { VersionRubric } from './rubric-storage.ts';
import { z } from 'zod';
import { UNITS, type Inputs } from './rubric.ts';
import { STATUSES_TO_PROCESS, type Status } from './statuses.ts';
import { dateFr } from './text.ts';
import { t } from '../i18n/index.ts';
import { AppError } from './errors.ts';

/** Statuses before sending: a sent application or "apply" moves them forward. */
export const STATUSES_BEFORE_GO: Status[] = ['new', 'to-read', 'scored', 'dismissed'];

export function offerOrError(db: Database, id: number): Offer {
  const o = Number.isInteger(id) ? offerById(db, id) : undefined;
  if (!o) throw new AppError('not-found', t('core.offerNotFound', { id }));
  return o;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export interface OfferToRead {
  id: number;
  source: string;
  url: string | null;
  title: string;
  company: string | null;
  location: string | null;
  contract: string | null;
  compensation: string | null;
  remote: string | null;
  received_at: string | null;
  /** description: text already in the database; browser: open the URL; human: protected page, ask for the text. */
  reading: 'description' | 'browser' | 'human';
  /** Length of the description in the database (0 if none). */
  length_description: number;
  /** Absent in summary mode (descriptions: false). */
  description?: string | null;
}

export interface OptionsToRead {
  /** Offers per page (500 by default). */
  limit?: number;
  /** Page (1 by default). */
  page?: number;
  /** false: summary without description (then read each offer with its id). true by default. */
  descriptions?: boolean;
  /** Whole descriptions (otherwise truncated to `length`). */
  full?: boolean;
  /** Maximum length of a truncated description (2,500 by default). */
  length?: number;
}

export interface ResultToRead {
  total: number;
  page: number;
  pages: number;
  /** Offers to read after this page. */
  remaining: number;
  offers: OfferToRead[];
}

/** Offers to process (new, to read) without a score, from the oldest to the most recent, by pages. */
export function offersToRead(db: Database, o: OptionsToRead = {}): ResultToRead {
  const r = listOffers(db, { statuses: STATUSES_TO_PROCESS, unscored: true, size: o.limit ?? 500, page: o.page, sort: 'id', order: 'asc' });
  const withDescriptions = o.descriptions !== false;
  const offers = r.offers.map((l): OfferToRead => {
    const d = offerById(db, l.id)!;
    const reading = d.description ? 'description' : l.source === 'glassdoor' ? 'human' : 'browser';
    const base: OfferToRead = {
      id: l.id,
      source: l.source,
      url: l.canonical_url,
      title: l.title,
      company: l.company,
      location: l.location,
      contract: l.contract,
      compensation: l.compensation,
      remote: l.remote,
      received_at: l.received_at,
      reading,
      length_description: d.description?.length ?? 0,
    };
    if (!withDescriptions) return base;
    const text = d.description ? (o.full ? d.description : truncate(d.description.replace(/\s+/g, ' '), o.length ?? 2500)) : null;
    return { ...base, description: text };
  });
  return { total: r.total, page: r.page, pages: r.pages, remaining: Math.max(0, r.total - (r.page - 1) * r.size - offers.length), offers };
}

export interface OptionsScore {
  /** Loads the current rubric (called only if an input has criteria). */
  rubric?: () => VersionRubric | null;
  /** Dry run: computes and returns the scores without saving anything. */
  dry_run?: boolean;
}

/** Saves scores in the batch format (in a transaction: all or nothing). */
export function scoreOffers(db: Database, received: unknown[], origin: string, o: OptionsScore = {}): ResultScoring[] {
  if (!received.length) throw new AppError('invalid', t('core.noneScore'));
  // The one place where a score coming from outside (command line, API, MCP server) is validated.
  const inputs: InputBatch[] = received.map(checkInputBatch);
  const rubric = inputs.some(isCriteriaScore) ? (o.rubric?.() ?? null) : null;
  const score = () =>
    inputs.map((e) => {
      const r = scoreInput(db, e, { origin, originOffer: 'manual', rubric });
      if (Array.isArray(e.tags) && e.tags.length) updateTags(db, r.id, e.tags, []);
      return r;
    });
  if (!o.dry_run) return transaction(db, score);
  db.exec('BEGIN IMMEDIATE');
  try {
    return score();
  } finally {
    db.exec('ROLLBACK');
  }
}

export const schemaSubScores = z.object({
  /** Modified sub-scores (criteria scored by the AI); null removes the sub-score (neutral value). */
  criteria: z.record(z.string(), z.object({ score: z.union([z.number(), z.string()]), justification: z.string().nullable().optional() }).nullable()).optional(),
  /** Inputs of the computed criteria; null clears a value (back to the deduction from the offer). */
  inputs: z
    .object({
      onsite_days: z.number().nullable().optional(),
      salary_min: z.number().nullable().optional(),
      salary_max: z.number().nullable().optional(),
      unit: z.enum(UNITS).nullable().optional(),
    })
    .optional(),
  blockers: z.array(z.string()).optional(),
});
/** A correction of the sub-scores typed in the dashboard (its values are checked against the rubric when the score is computed). */
export type InputSubScores = z.infer<typeof schemaSubScores>;

/**
 * Correction of the sub-scores from the interface: starts from the last score (sub-scores, inputs, rules,
 * "fit", "gaps"), applies the changes and adds a score to the history (origin interface).
 * On an overall score of the old rubric, the criteria not entered get the neutral value.
 */
export function updateSubScores(db: Database, id: number, s: InputSubScores, origin: string, rubric: VersionRubric): ResultScoring {
  offerOrError(db, id);
  const last = scoresOffer(db, id)[0];
  const base = last?.input ?? { criteria: {}, inputs: undefined, blockers: [] };
  const criteria: NonNullable<InputBatch['criteria']> = {};
  for (const [k, v] of Object.entries(base.criteria)) criteria[k] = { score: v.score, justification: v.justification, origin: v.origin ?? 'ai' };
  for (const [k, v] of Object.entries(s.criteria ?? {})) {
    if (v === null) delete criteria[k];
    else criteria[k] = { score: v.score, justification: v.justification ?? undefined, origin: 'interface' };
  }
  const inputs: Record<string, unknown> = { ...(base.inputs ?? {}) };
  for (const [k, v] of Object.entries(s.inputs ?? {})) {
    if (v === null || v === undefined) delete inputs[k];
    else inputs[k] = v;
  }
  return transaction(db, () =>
    scoreInput(
      db,
      {
        id,
        criteria,
        inputs: inputs as Inputs,
        blockers: s.blockers ?? base.blockers,
        fit: last?.fit ?? undefined,
        gaps: last?.gaps ?? undefined,
        read: last?.read ?? true,
      },
      { origin, rubric },
    ),
  );
}

export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(h\/f|f\/h|h-f|f-h)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 6)
    .join('-');
}

export interface PreparationApplication {
  offer: DetailOffer;
  data_dir: string;
  suggested_folder: string;
  steps: string[];
}

/** End statuses: "apply" reopens them (the user takes the offer up again). */
const REOPENABLE_STATUSES: Status[] = ['withdrawn', 'rejected', 'closed'];

/**
 * Moves the offer to "go" and gathers what is needed to apply. An application in progress
 * (go, sent, followed-up, interview) keeps its status; a withdrawn, rejected or closed offer is reopened.
 */
export function prepareApplication(db: Database, dataDir: string, id: number, origin: string): PreparationApplication {
  const before = offerOrError(db, id);
  if (STATUSES_BEFORE_GO.includes(before.status)) addStatus(db, id, 'go', { comment: 'apply', origin });
  else if (REOPENABLE_STATUSES.includes(before.status)) addStatus(db, id, 'go', { comment: t('core.import', { status: before.status }), origin });
  const d = detailOffer(db, id)!;
  const folder = d.application?.folder ?? `candidatures/${slug(`${d.company ?? d.source} ${d.title}`)}`;
  return {
    offer: d,
    data_dir: dataDir,
    suggested_folder: folder,
    steps: [
      t('core.step.reread', { url: d.canonical_url ?? t('core.withoutUrl') }),
      t('core.step.instructions'),
      t('core.step.folder', { folder }),
      t('core.step.save', { id, folder }),
      t('core.step.send'),
    ],
  };
}

/**
 * Updates the application of an offer. With a sending date, an offer not sent yet moves
 * to "sent" (comment: channel and date).
 */
export function trackApplication(db: Database, id: number, fields: FieldsApplication, origin: string): { offer: DetailOffer; status_added: Status | null } {
  const o = offerOrError(db, id);
  const send = fields.sent_at?.trim();
  // "02/11/2026" is stored as 2026-11-02; a free text ("≈ 25/08/2026") is kept as it is.
  const fieldsNorm: FieldsApplication = {
    ...fields,
    sent_at: send && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(send) ? dateFr(send) : fields.sent_at,
  };
  return transaction(db, () => {
    const c = saveApplication(db, id, fieldsNorm, { origin });
    let statusAdded: Status | null = null;
    if (send && [...STATUSES_BEFORE_GO, 'go'].includes(o.status)) {
      const comment = [c.channel, t('core.sentAt', { date: send })].filter(Boolean).join(', ');
      addStatus(db, id, 'sent', { comment, origin });
      statusAdded = 'sent';
    }
    return { offer: detailOffer(db, id)!, status_added: statusAdded };
  });
}
