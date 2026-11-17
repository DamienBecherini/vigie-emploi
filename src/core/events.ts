// Journal of an application: dated events (messages, interviews, tests, proposals, decisions, notes)
// and deadlines (event dated in the future, or past but not done yet).
// The database keeps what happened and when; documents stay in the application folder
// (an event only keeps its path, relative to the data folder).
import type { Database } from '../db/database.ts';
import { now } from './text.ts';
import { TYPES_EVENT, type OriginEvent, type Direction, type TypeEvent } from './statuses.ts';
import { t as tr } from '../i18n/index.ts';

export { LABELS_TYPES, ORIGINS_EVENT, DIRECTION_MESSAGE, TYPES_EVENT } from './statuses.ts';
export type { OriginEvent, Direction, TypeEvent } from './statuses.ts';

export interface JournalEvent {
  id: number;
  offer_id: number;
  type: TypeEvent;
  direction: Direction | null;
  /** YYYY-MM-DD or YYYY-MM-DDTHH:MM (local time). */
  at: string;
  done: boolean;
  summary: string;
  details: string | null;
  channel: string | null;
  contacts: string | null;
  amount: number | null;
  unit: string | null;
  days: number | null;
  /** Paths relative to the data folder. */
  files: string[];
  origin: OriginEvent;
  import_key: string | null;
  created_at: string;
  updated_at: string | null;
}

/** Journal event, with its deadline state computed at today's date. */
export interface EventJournal extends JournalEvent {
  /** Not done yet (upcoming or overdue). */
  deadline: boolean;
  /** Not done and dated before today. */
  overdue: boolean;
}

export interface DeadlineOffer extends EventJournal {
  title: string;
  company: string | null;
  status: string;
}

/** Input of an event. Optional fields: absent = unchanged (update), null or '' = cleared. */
export interface EventInput {
  type?: string;
  direction?: string | null;
  at?: string;
  done?: boolean;
  summary?: string;
  details?: string | null;
  channel?: string | null;
  contacts?: string | null;
  amount?: number | string | null;
  unit?: string | null;
  days?: number | string | null;
  files?: string[] | null;
}

// ---------------------------------------------------------------------------------------------
// Dates (local time of the machine: the user's)
// ---------------------------------------------------------------------------------------------

const two = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD of today (local time), shifted by `days`. */
export function dayLocal(d: Date = new Date(), days = 0): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
  return `${x.getFullYear()}-${two(x.getMonth() + 1)}-${two(x.getDate())}`;
}

/** AAAA-MM-JJTHH:MM (heure locale). */
export function instantLocal(d: Date = new Date()): string {
  return `${dayLocal(d)}T${two(d.getHours())}:${two(d.getMinutes())}`;
}

function dateValid(a: number, m: number, j: number): boolean {
  const d = new Date(a, m - 1, j);
  return d.getFullYear() === a && d.getMonth() === m - 1 && d.getDate() === j;
}

/**
 * Reads an event date: "05/11/2026", "05/11/2026 14:30", "05/11/2026 à 14 h 30", "2026-11-05",
 * "2026-11-05T14:30", "aujourd'hui", "demain", "today", "tomorrow", "+3" (in 3 days). Returns YYYY-MM-DD or YYYY-MM-DDTHH:MM.
 */
export function readDateEvent(text: string, nowAt: Date = new Date()): string {
  const t = text.trim().toLowerCase();
  if (/^aujourd'?hui$|^aujourd’hui$|^today$/.test(t)) return dayLocal(nowAt);
  if (t === 'demain' || t === 'tomorrow') return dayLocal(nowAt, 1);
  const rel = t.match(/^\+\s*(\d{1,3})\s*[jd]?$/);
  if (rel) return dayLocal(nowAt, Number(rel[1]));
  let a: number, m: number, j: number;
  let rest: string;
  const fr = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(.*)$/);
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
  if (fr) {
    [j, m, a] = [Number(fr[1]), Number(fr[2]), Number(fr[3])];
    rest = fr[4];
  } else if (iso) {
    [a, m, j] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    rest = iso[4];
  } else {
    throw new Error(tr('core.dateFormat', { text }));
  }
  if (!dateValid(a, m, j)) throw new Error(tr('core.dateInvalid', { text }));
  const day = `${a}-${two(m)}-${two(j)}`;
  const r = rest.trim().replace(/^(t|à|a)\s*/, '');
  if (!r) return day;
  const h = r.match(/^(\d{1,2})\s*(?:h|:)\s*(\d{2})?(?::\d{2}(?:\.\d+)?)?\s*(?:z|[+-]\d{2}:?\d{2})?$/);
  if (!h || Number(h[1]) > 23 || Number(h[2] ?? 0) > 59) throw new Error(tr('core.hourInvalid', { text }));
  return `${day}T${two(Number(h[1]))}:${h[2] ?? '00'}`;
}

/** Is the event in the future? (a date alone of today is not). */
export function isFuture(at: string, nowAt: Date = new Date()): boolean {
  return at.length > 10 ? at > instantLocal(nowAt) : at > dayLocal(nowAt);
}

/** "05/11/2026" or "05/11/2026 14 h 30". */
export function dateEventFr(at: string): string {
  const m = at.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return at;
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]} h ${m[5]}` : ''}`;
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

function textOrNull(v: unknown, name: string): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') throw new Error(tr('core.textExpected', { name }));
  const t = v.trim();
  return t === '' ? null : t;
}

function numberOrNull(v: unknown, name: string): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n =
    typeof v === 'number'
      ? v
      : Number(
          String(v)
            .replace(/[\s  ]/g, '')
            .replace(',', '.'),
        );
  if (!Number.isFinite(n)) throw new Error(tr('core.numberExpected', { name, value: String(v) }));
  return n;
}

/**
 * File path relative to the data folder, with forward slashes: refuses absolute paths,
 * "..", hidden segments (".git") and control characters.
 */
export function pathRelative(v: string): string {
  const t = v
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '');
  if (!t) throw new Error(tr('core.pathEmpty'));
  if (/^[a-z]:/i.test(t) || t.startsWith('/')) throw new Error(tr('core.pathAbsolute', { path: v }));
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what this check refuses
  if (/[\u0000-\u001f]/.test(t)) throw new Error(tr('core.pathInvalid', { path: v }));
  const segments = t.split('/').filter((s) => s !== '' && s !== '.');
  if (segments.some((s) => s === '..' || s.startsWith('.'))) throw new Error(tr('core.pathRefused', { path: v }));
  return segments.join('/');
}

function filesValid(v: unknown): string[] {
  if (v === null || v === undefined) return [];
  if (!Array.isArray(v)) throw new Error(tr('core.filesList'));
  return [...new Set(v.map((f) => pathRelative(String(f))))];
}

function typeValid(v: unknown): TypeEvent {
  if (typeof v !== 'string' || !(TYPES_EVENT as readonly string[]).includes(v)) {
    throw new Error(tr('core.typeEventUnknown', { type: String(v), types: TYPES_EVENT.join(', ') }));
  }
  return v as TypeEvent;
}

function directionValid(v: unknown): Direction | null {
  const t = textOrNull(v, 'direction');
  if (t === null) return null;
  const n = t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (n === 'sent' || n === 'envoye') return 'sent';
  if (n === 'received' || n === 'recu') return 'received';
  throw new Error(tr('core.directionUnknown', { direction: t }));
}

// ---------------------------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------------------------

type LineRaw = Omit<JournalEvent, 'done' | 'files'> & { done: number; files: string };

function fromLine(l: LineRaw): JournalEvent {
  let files: string[] = [];
  try {
    const f = JSON.parse(l.files || '[]') as unknown;
    if (Array.isArray(f)) files = f.map(String);
  } catch {
    /* colonne abîmée : liste vide */
  }
  return { ...l, done: Boolean(l.done), files };
}

function withState<T extends JournalEvent>(e: T, today: string): T & { deadline: boolean; overdue: boolean } {
  return { ...e, deadline: !e.done, overdue: !e.done && e.at.slice(0, 10) < today };
}

export function eventById(db: Database, id: number): JournalEvent | undefined {
  const l = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as LineRaw | undefined;
  return l ? fromLine(l) : undefined;
}

export function eventOrError(db: Database, id: number): JournalEvent {
  const e = Number.isInteger(id) ? eventById(db, id) : undefined;
  if (!e) throw new Error(tr('core.eventNotFound', { id }));
  return e;
}

/**
 * Journal of an offer: deadlines (not done) first, from the closest to the farthest (overdue ones
 * on top), then the done events, from the most recent to the oldest.
 */
export function journal(db: Database, offerId: number, nowAt: Date = new Date()): EventJournal[] {
  const today = dayLocal(nowAt);
  const lines = db
    .prepare(
      `SELECT * FROM events WHERE offer_id = ?
       ORDER BY done ASC,
                CASE WHEN done = 0 THEN at END ASC,
                CASE WHEN done = 1 THEN at END DESC,
                id DESC`,
    )
    .all(offerId) as unknown as LineRaw[];
  return lines.map((l) => withState(fromLine(l), today));
}

export interface Deadlines {
  today: string;
  until: string;
  overdue: DeadlineOffer[];
  upcoming: DeadlineOffer[];
}

/** Deadlines: overdue (past date, not done) and upcoming over `days` days (today included). */
export function deadlines(db: Database, o: { days?: number; now?: Date } = {}): Deadlines {
  const days = o.days ?? 7;
  if (!Number.isInteger(days) || days < 0 || days > 3660) throw new Error(tr('core.daysInvalid', { days }));
  const ref = o.now ?? new Date();
  const today = dayLocal(ref);
  const until = dayLocal(ref, days);
  const lines = (
    db.prepare('SELECT * FROM deadlines WHERE substr(at, 1, 10) <= ? ORDER BY at ASC, id ASC').all(until) as unknown as (LineRaw & {
      title: string;
      company: string | null;
      status: string;
    })[]
  ).map((l) => withState({ ...fromLine(l), title: l.title, company: l.company, status: l.status }, today));
  return {
    today,
    until,
    overdue: lines.filter((l) => l.overdue),
    upcoming: lines.filter((l) => !l.overdue),
  };
}

/** Next deadline of an offer (the oldest not done: an overdue one comes before the rest). */
export function nextDeadline(db: Database, offerId: number): JournalEvent | null {
  const l = db.prepare('SELECT * FROM events WHERE offer_id = ? AND done = 0 ORDER BY at ASC, id ASC LIMIT 1').get(offerId) as LineRaw | undefined;
  return l ? fromLine(l) : null;
}

// ---------------------------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------------------------

function touchOffer(db: Database, offerId: number): void {
  db.prepare('UPDATE offers SET updated_at = ? WHERE id = ?').run(now(), offerId);
}

/**
 * Adds an event to the journal of an offer. `done` defaults to false for a future date
 * (it is a deadline) and to true otherwise. `at` defaults to now.
 */
export function addEvent(db: Database, offerId: number, s: EventInput, origin: OriginEvent, opts: { importKey?: string; now?: Date } = {}): JournalEvent {
  if (!db.prepare('SELECT 1 FROM offers WHERE id = ?').get(offerId)) throw new Error(tr('core.offerNotFound', { id: offerId }));
  const type = typeValid(s.type);
  const summary = textOrNull(s.summary, 'summary');
  if (!summary) throw new Error(tr('core.summaryEvent'));
  const ref = opts.now ?? new Date();
  const at = s.at === undefined || s.at === null || String(s.at).trim() === '' ? instantLocal(ref) : readDateEvent(String(s.at), ref);
  const done = s.done === undefined || s.done === null ? !isFuture(at, ref) : Boolean(s.done);
  const info = db
    .prepare(
      `INSERT INTO events (offer_id, type, direction, at, done, summary, details, channel, contacts, amount, unit, days,
         files, origin, import_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      offerId,
      type,
      directionValid(s.direction),
      at,
      done ? 1 : 0,
      summary,
      textOrNull(s.details, 'details'),
      textOrNull(s.channel, 'channel'),
      textOrNull(s.contacts, 'contacts'),
      numberOrNull(s.amount, 'amount'),
      textOrNull(s.unit, 'unit'),
      numberOrNull(s.days, 'days'),
      JSON.stringify(filesValid(s.files)),
      origin,
      opts.importKey ?? null,
      now(),
    );
  touchOffer(db, offerId);
  return eventById(db, Number(info.lastInsertRowid))!;
}

/** Updates an event: absent field = unchanged; null or '' = cleared (except type, date and summary). */
export function updateEvent(db: Database, id: number, s: EventInput, opts: { now?: Date } = {}): JournalEvent {
  const e = eventOrError(db, id);
  const updated: string[] = [];
  const params: (string | number | null)[] = [];
  const set = (col: string, v: string | number | null) => {
    updated.push(`${col} = ?`);
    params.push(v);
  };
  if (s.type !== undefined) set('type', typeValid(s.type));
  if (s.direction !== undefined) set('direction', directionValid(s.direction));
  if (s.at !== undefined) set('at', readDateEvent(String(s.at), opts.now));
  if (s.done !== undefined) set('done', s.done ? 1 : 0);
  if (s.summary !== undefined) {
    const r = textOrNull(s.summary, 'summary');
    if (!r) throw new Error(tr('core.summaryEvent'));
    set('summary', r);
  }
  for (const k of ['details', 'channel', 'contacts', 'unit'] as const) if (s[k] !== undefined) set(k, textOrNull(s[k], k));
  for (const k of ['amount', 'days'] as const) if (s[k] !== undefined) set(k, numberOrNull(s[k], k));
  if (s.files !== undefined) set('files', JSON.stringify(filesValid(s.files)));
  if (updated.length) {
    db.prepare(`UPDATE events SET ${updated.join(', ')}, updated_at = ? WHERE id = ?`).run(...params, now(), id);
    touchOffer(db, e.offer_id);
  }
  return eventById(db, id)!;
}

export function markDone(db: Database, id: number, done = true): JournalEvent {
  return updateEvent(db, id, { done });
}

export function deleteEvent(db: Database, id: number): JournalEvent {
  const e = eventOrError(db, id);
  db.prepare('DELETE FROM events WHERE id = ?').run(id);
  touchOffer(db, e.offer_id);
  return e;
}

/** Short text of a deadline for the tracker: "04/11: Relancer" ("overdue" if the date has passed). */
export function textDeadline(e: JournalEvent, nowAt: Date = new Date()): string {
  const m = e.at.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  const when = m ? `${m[3]}/${m[2]}${m[1] !== String(nowAt.getFullYear()) ? `/${m[1]}` : ''}${m[4] ? ` ${m[4]} h ${m[5]}` : ''}` : e.at;
  const overdue = !e.done && e.at.slice(0, 10) < dayLocal(nowAt) ? ' (en retard)' : '';
  return `**${when}**${overdue} : ${e.summary}`;
}
