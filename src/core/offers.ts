// Operations on offers: creation / completion, statuses, scores, tags, applications, detail.
import type { Database } from '../db/database.ts';
import { isStatus, type Status } from './statuses.ts';
import { readCompensation, now, sanitize } from './text.ts';
import { journal, type EventJournal } from './events.ts';
import type { Breakdown, Input } from './rubric.ts';
import { t } from '../i18n/index.ts';

export type Origin = 'email' | 'import-batch' | 'import-register' | 'import-tracker' | 'manual';

export interface FieldsOffer {
  title?: string | null;
  company?: string | null;
  location?: string | null;
  contract?: string | null;
  compensation?: string | null;
  remote?: string | null;
  published_at?: string | null;
  received_at?: string | null;
  description?: string | null;
  stack?: string | null;
  canonical_url?: string | null;
}

export interface Offer {
  id: number;
  source: string;
  site_id: string;
  canonical_url: string | null;
  title: string;
  company: string | null;
  location: string | null;
  contract: string | null;
  compensation: string | null;
  compensation_min: number | null;
  compensation_max: number | null;
  compensation_unit: string | null;
  remote: string | null;
  published_at: string | null;
  received_at: string | null;
  description: string | null;
  stack: string | null;
  origin: Origin;
  status: Status;
  score: number | null;
  created_at: string;
  updated_at: string;
}

export interface Score {
  id: number;
  offer_id: number;
  raw_score: number | null;
  penalties: string | null;
  score: number | null;
  fit: string | null;
  gaps: string | null;
  read: boolean;
  rubric_version: string | null;
  origin: string;
  scored_at: string;
  /** Criteria-based score: exact value (score = rounded to the half point). null for an overall score. */
  exact_score: number | null;
  /** Sub-scores, inputs and reported rules (what was entered). null: overall score of the old rubric. */
  input: Input | null;
  /** Computed breakdown: sub-scores, weights, contributions, applied rules, flags. */
  breakdown: Breakdown | null;
  recalculated_at: string | null;
}

export interface LineStatus {
  id: number;
  offer_id: number;
  status: Status;
  comment: string | null;
  origin: string;
  at: string;
}

export interface Application {
  id: number;
  offer_id: number;
  folder: string | null;
  cv: string | null;
  sent_at: string | null;
  channel: string | null;
  message: string | null;
  next_action: string | null;
  next_action_origin: string | null;
  label: string | null;
  conditions: string | null;
  state: string | null;
  updated_at: string | null;
}

/** Editable fields of an application: absent = unchanged, null or empty string = cleared. */
export type FieldsApplication = Partial<
  Pick<Application, 'folder' | 'cv' | 'sent_at' | 'channel' | 'message' | 'next_action' | 'label' | 'conditions' | 'state'>
>;

export const FIELDS_APPLICATION = [
  'folder',
  'cv',
  'sent_at',
  'channel',
  'message',
  'next_action',
  'label',
  'conditions',
  'state',
] as const satisfies readonly (keyof FieldsApplication)[];

export interface DetailOffer extends Offer {
  tags: string[];
  scores: Score[];
  statuses: LineStatus[];
  application: Application | null;
  /** Journal: deadlines first, then events from the most recent to the oldest. */
  events: EventJournal[];
}

const FIELDS: (keyof FieldsOffer)[] = [
  'title',
  'company',
  'location',
  'contract',
  'compensation',
  'remote',
  'published_at',
  'received_at',
  'description',
  'stack',
  'canonical_url',
];

export function findOffer(db: Database, source: string, siteId: string): Offer | undefined {
  return db.prepare('SELECT * FROM offers WHERE source = ? AND site_id = ?').get(source, siteId) as Offer | undefined;
}

export function offerById(db: Database, id: number): Offer | undefined {
  return db.prepare('SELECT * FROM offers WHERE id = ?').get(id) as Offer | undefined;
}

export function offerByUrl(db: Database, url: string): Offer | undefined {
  return db.prepare('SELECT * FROM offers WHERE canonical_url = ?').get(url) as Offer | undefined;
}

/** Replaces the offer's link (null to clear it). Only http(s) addresses are accepted. */
export function updateLink(db: Database, id: number, url: string | null): void {
  const clean = url?.trim() || null;
  if (clean !== null && !/^https?:\/\/\S+$/i.test(clean)) {
    throw new Error(t('core.linkInvalid', { link: clean }));
  }
  db.prepare('UPDATE offers SET canonical_url = ?, updated_at = ? WHERE id = ?').run(clean, now(), id);
}

function valuesCleaned(fields: FieldsOffer): Partial<Record<keyof FieldsOffer, string>> {
  const r: Partial<Record<keyof FieldsOffer, string>> = {};
  for (const k of FIELDS) {
    const v = sanitize(fields[k]);
    if (v !== null) r[k] = v;
  }
  return r;
}

/**
 * Creates the offer (source, site_id) if it does not exist; otherwise fills in the empty fields
 * (or replaces them all if `overwrite`). Returns the offer and whether it was just created.
 */
export function saveOffer(
  db: Database,
  source: string,
  siteId: string,
  fields: FieldsOffer,
  origin: Origin,
  opts: { overwrite?: boolean; at?: string } = {},
): { offer: Offer; created: boolean } {
  const v = valuesCleaned(fields);
  const existing = findOffer(db, source, siteId);
  const at = opts.at ?? now();
  if (!existing) {
    const r = readCompensation(v.compensation);
    const info = db
      .prepare(
        `INSERT INTO offers (source, site_id, canonical_url, title, company, location, contract, compensation,
           compensation_min, compensation_max, compensation_unit, remote, published_at, received_at, description,
           stack, origin, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
      )
      .run(
        source,
        siteId,
        v.canonical_url ?? null,
        v.title ?? '',
        v.company ?? null,
        v.location ?? null,
        v.contract ?? null,
        v.compensation ?? null,
        r.min,
        r.max,
        r.unit,
        v.remote ?? null,
        v.published_at ?? null,
        v.received_at ?? null,
        v.description ?? null,
        v.stack ?? null,
        origin,
        at,
        at,
      );
    return { offer: offerById(db, Number(info.lastInsertRowid))!, created: true };
  }
  const updated: string[] = [];
  const params: (string | number | null)[] = [];
  for (const k of FIELDS) {
    const nv = v[k];
    if (nv === undefined) continue;
    const current = existing[k as keyof Offer] as string | null;
    if (current === nv) continue;
    if (!opts.overwrite && current !== null && current !== '') continue;
    updated.push(`${k} = ?`);
    params.push(nv);
    if (k === 'compensation') {
      const r = readCompensation(nv);
      updated.push('compensation_min = ?', 'compensation_max = ?', 'compensation_unit = ?');
      params.push(r.min, r.max, r.unit);
    }
  }
  if (updated.length) {
    db.prepare(`UPDATE offers SET ${updated.join(', ')}, updated_at = ? WHERE id = ?`).run(...params, now(), existing.id);
  }
  return { offer: offerById(db, existing.id)!, created: false };
}

/**
 * Order of the status history used to find the current status: the most recent, except that an automatic
 * line from before the go (offer seen again in a batch, the register or an alert) comes after the others
 * as soon as the offer has been tracked (go and beyond): it does not change the status of an application.
 * Same rule in migration 0003.
 */
export const ORDER_STATUSES = `(s.origin IN ('ingest', 'import-batch', 'import-register')
    AND s.status IN ('new', 'to-read', 'scored', 'dismissed')
    AND EXISTS (SELECT 1 FROM statuses s2 WHERE s2.offer_id = s.offer_id
                AND s2.status IN ('go', 'sent', 'followed-up', 'interview', 'rejected', 'closed', 'withdrawn'))),
  s.at DESC, s.id DESC`;

/** Recomputes the denormalized status / score columns from the history (the last one wins). */
export function recompute(db: Database, offerId: number): void {
  db.prepare(
    `UPDATE offers SET
       status = COALESCE((SELECT s.status FROM statuses s WHERE s.offer_id = offers.id ORDER BY ${ORDER_STATUSES} LIMIT 1), 'new'),
       score = (SELECT score FROM scores WHERE offer_id = offers.id ORDER BY scored_at DESC, id DESC LIMIT 1),
       updated_at = ?
     WHERE id = ?`,
  ).run(now(), offerId);
}

export interface OptionsStatus {
  comment?: string | null;
  origin?: string;
  at?: string;
  /** Add nothing if an identical line (status, comment, origin) already exists: idempotent imports. */
  ifMissing?: boolean;
}

export function addStatus(db: Database, offerId: number, status: string, opts: OptionsStatus = {}): boolean {
  if (!isStatus(status)) throw new Error(t('core.statusUnknown', { status }));
  const comment = sanitize(opts.comment) ?? null;
  const origin = opts.origin ?? 'cli';
  if (opts.ifMissing) {
    const already = db
      .prepare("SELECT 1 FROM statuses WHERE offer_id = ? AND status = ? AND origin = ? AND COALESCE(comment, '') = ?")
      .get(offerId, status, origin, comment ?? '');
    if (already) return false;
  }
  db.prepare('INSERT INTO statuses (offer_id, status, comment, origin, at) VALUES (?, ?, ?, ?, ?)').run(offerId, status, comment, origin, opts.at ?? now());
  if (status === 'sent') dateSendByDefault(db, offerId, opts.at);
  recompute(db, offerId);
  return true;
}

/**
 * Move to "sent" without a sending date: the status date becomes the sending date (otherwise the tracker
 * shows "—" and the reply delay cannot be computed), and a next action "Envoyer…" is cleared.
 */
function dateSendByDefault(db: Database, offerId: number, at?: string): void {
  const d = new Date();
  const day =
    at && /^\d{4}-\d{2}-\d{2}/.test(at)
      ? at.slice(0, 10)
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  db.prepare(
    'INSERT INTO applications (offer_id, sent_at) VALUES (?, ?) ON CONFLICT (offer_id) DO UPDATE SET sent_at = COALESCE(sent_at, excluded.sent_at)',
  ).run(offerId, day);
  const columns = db.prepare("SELECT name FROM pragma_table_info('applications')").all() as { name: string }[];
  if (columns.some((c) => c.name === 'next_action')) {
    db.prepare("UPDATE applications SET next_action = NULL WHERE offer_id = ? AND next_action LIKE 'envoyer%'").run(offerId);
  }
}

export interface InputScore {
  raw_score?: number | null;
  penalties?: string | null;
  score?: number | null;
  fit?: string | null;
  gaps?: string | null;
  read?: boolean | null;
  rubric_version?: string | null;
  exact_score?: number | null;
  input?: Input | null;
  breakdown?: Breakdown | null;
}

function numberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error(t('core.scoreInvalid', { score: String(v) }));
  if (n < 0 || n > 10) throw new Error(t('core.scoreScale', { score: n }));
  return n;
}

export function addScore(db: Database, offerId: number, e: InputScore, opts: { origin?: string; at?: string; ifMissing?: boolean } = {}): boolean {
  const score = numberOrNull(e.score);
  const raw = numberOrNull(e.raw_score);
  const origin = opts.origin ?? 'cli';
  const at = opts.at ?? now();
  if (opts.ifMissing) {
    const already = db.prepare('SELECT 1 FROM scores WHERE offer_id = ? AND origin = ? AND scored_at = ? AND score IS ?').get(offerId, origin, at, score);
    if (already) return false;
  }
  db.prepare(
    `INSERT INTO scores (offer_id, raw_score, penalties, score, fit, gaps, read, rubric_version, origin, scored_at,
                        exact_score, input, breakdown)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    offerId,
    raw,
    sanitize(e.penalties),
    score,
    sanitize(e.fit),
    sanitize(e.gaps),
    e.read ? 1 : 0,
    sanitize(e.rubric_version),
    origin,
    at,
    e.exact_score ?? null,
    e.input ? JSON.stringify(e.input) : null,
    e.breakdown ? JSON.stringify(e.breakdown) : null,
  );
  recompute(db, offerId);
  return true;
}

export function tagsOffer(db: Database, offerId: number): string[] {
  return (
    db.prepare('SELECT t.name FROM offer_tags ot JOIN tags t ON t.id = ot.tag_id WHERE ot.offer_id = ? ORDER BY t.name').all(offerId) as { name: string }[]
  ).map((r) => r.name);
}

export function normalizeTag(name: string): string {
  return name.trim().replace(/\s+/g, '-').toLowerCase();
}

/** Adds and removes tags; returns the updated list. */
export function updateTags(db: Database, offerId: number, additions: string[], removals: string[]): string[] {
  for (const raw of additions) {
    const name = normalizeTag(raw);
    if (!name) continue;
    db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(name);
    const tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(name) as { id: number };
    db.prepare('INSERT OR IGNORE INTO offer_tags (offer_id, tag_id) VALUES (?, ?)').run(offerId, tag.id);
  }
  for (const raw of removals) {
    db.prepare('DELETE FROM offer_tags WHERE offer_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?)').run(offerId, normalizeTag(raw));
  }
  db.prepare('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM offer_tags)').run();
  db.prepare('UPDATE offers SET updated_at = ? WHERE id = ?').run(now(), offerId);
  return tagsOffer(db, offerId);
}

export function applicationOf(db: Database, offerId: number): Application | null {
  return (db.prepare('SELECT * FROM applications WHERE offer_id = ?').get(offerId) as Application | undefined) ?? null;
}

/**
 * Creates or updates the application of an offer. An absent field (undefined) is kept; null or ''
 * clears it. `origin` is kept for the next action (importing _SUIVI.md does not replace
 * a text entered in the interface, the CLI or through MCP).
 */
export function saveApplication(db: Database, offerId: number, c: FieldsApplication, opts: { origin?: string } = {}): Application {
  let current = applicationOf(db, offerId);
  if (!current) {
    db.prepare('INSERT INTO applications (offer_id, updated_at) VALUES (?, ?)').run(offerId, now());
    current = applicationOf(db, offerId)!;
  }
  const updated: string[] = [];
  const params: (string | null)[] = [];
  for (const k of FIELDS_APPLICATION) {
    if (c[k] === undefined) continue;
    const v = sanitizeField(c[k]);
    if (v === current[k]) continue;
    updated.push(`${k} = ?`);
    params.push(v);
    if (k === 'next_action') {
      updated.push('next_action_origin = ?');
      params.push(v === null ? null : (opts.origin ?? 'cli'));
    }
  }
  if (updated.length) {
    db.prepare(`UPDATE applications SET ${updated.join(', ')}, updated_at = ? WHERE offer_id = ?`).run(...params, now(), offerId);
    db.prepare('UPDATE offers SET updated_at = ? WHERE id = ?').run(now(), offerId);
  }
  return applicationOf(db, offerId)!;
}

/** Value of an application field: cleaned text (surrounding spaces removed), null if empty. */
function sanitizeField(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

type LineScore = Omit<Score, 'read' | 'input' | 'breakdown'> & { read: number; input: string | null; breakdown: string | null };

/** Scores of an offer, from the most recent to the oldest (sub-scores and breakdown parsed). */
export function scoresOffer(db: Database, offerId: number): Score[] {
  return (db.prepare('SELECT * FROM scores WHERE offer_id = ? ORDER BY scored_at DESC, id DESC').all(offerId) as unknown as LineScore[]).map((n) => ({
    ...n,
    read: Boolean(n.read),
    input: n.input ? (JSON.parse(n.input) as Input) : null,
    breakdown: n.breakdown ? (JSON.parse(n.breakdown) as Breakdown) : null,
  }));
}

export function detailOffer(db: Database, id: number): DetailOffer | undefined {
  const offer = offerById(db, id);
  if (!offer) return undefined;
  const scores = scoresOffer(db, id);
  const statuses = db.prepare('SELECT * FROM statuses WHERE offer_id = ? ORDER BY at DESC, id DESC').all(id) as unknown as LineStatus[];
  return { ...offer, tags: tagsOffer(db, id), scores, statuses, application: applicationOf(db, id), events: journal(db, id) };
}

/** Number of offers of a company already in the database (case-insensitive comparison). */
export function companyOffers(db: Database, company: string, exceptId?: number): number {
  const r = db.prepare('SELECT COUNT(*) AS n FROM offers WHERE company = ? COLLATE NOCASE AND id IS NOT ?').get(company.trim(), exceptId ?? null) as {
    n: number;
  };
  return r.n;
}

/**
 * Merges the offer `duplicate` into the offer `target`: scores, statuses, tags and application move to the target,
 * the empty fields of the target are filled in, then the duplicate is deleted.
 */
export function mergeOffers(db: Database, target: number, duplicate: number): void {
  if (target === duplicate) return;
  const d = offerById(db, duplicate);
  if (!d || !offerById(db, target)) throw new Error(t('core.mergeImpossible', { target, duplicate }));
  db.prepare('UPDATE scores SET offer_id = ? WHERE offer_id = ?').run(target, duplicate);
  db.prepare('UPDATE statuses SET offer_id = ? WHERE offer_id = ?').run(target, duplicate);
  db.prepare('UPDATE OR IGNORE events SET offer_id = ? WHERE offer_id = ?').run(target, duplicate);
  db.prepare('INSERT OR IGNORE INTO offer_tags (offer_id, tag_id) SELECT ?, tag_id FROM offer_tags WHERE offer_id = ?').run(target, duplicate);
  const cd = applicationOf(db, duplicate);
  if (cd) {
    if (!applicationOf(db, target)) {
      db.prepare('UPDATE applications SET offer_id = ? WHERE offer_id = ?').run(target, duplicate);
    } else {
      const fields: FieldsApplication = {};
      const cc = applicationOf(db, target)!;
      for (const k of FIELDS_APPLICATION) if (cc[k] === null && cd[k] !== null) fields[k] = cd[k];
      saveApplication(db, target, fields, { origin: cd.next_action_origin ?? undefined });
    }
  }
  const complements: FieldsOffer = {};
  for (const k of FIELDS) complements[k] = d[k as keyof Offer] as string | null;
  const c = offerById(db, target)!;
  saveOffer(db, c.source, c.site_id, complements, c.origin);
  db.prepare('DELETE FROM offers WHERE id = ?').run(duplicate);
  recompute(db, target);
}
