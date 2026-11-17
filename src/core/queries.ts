// Paginated list of offers (server side), shared by the CLI and the API.
import type { Database } from '../db/database.ts';
import { COLUMNS_SORT, STATUSES_APPLICATION, type ColumnSort } from './statuses.ts';
import type { Offer } from './offers.ts';

export interface Filters {
  statuses?: string[];
  sources?: string[];
  tags?: string[];
  scoreMin?: number;
  scoreMax?: number;
  /** true: only offers without a score; false: only scored ones. */
  unscored?: boolean;
  contract?: string;
  remote?: string;
  /** Recherche plein texte (titre, entreprise, description, stack). */
  q?: string;
  receivedFrom?: string;
  receivedUntil?: string;
  publishedFrom?: string;
  publishedUntil?: string;
  myApplications?: boolean;
}

export interface OptionsList extends Filters {
  page?: number;
  size?: number;
  /** One column, or several levels separated by commas: `received_at:desc,score:desc`. */
  sort?: string;
  /** Direction of the levels that do not give one (desc by default). */
  order?: 'asc' | 'desc';
}

export interface LevelSort {
  column: ColumnSort;
  order: 'asc' | 'desc';
}

/**
 * Reads the sort levels: `score`, `received_at:desc,score:asc`… Unknown columns and duplicates are ignored;
 * a level without a direction takes `order`. Without a valid level: most recent reception first.
 */
export function levelsSort(sort?: string, order?: 'asc' | 'desc'): LevelSort[] {
  const byDefault = order === 'asc' ? 'asc' : 'desc';
  const levels: LevelSort[] = [];
  for (const chunk of (sort ?? '').split(',')) {
    const [col, direction] = chunk
      .trim()
      .split(':')
      .map((x) => x.trim().toLowerCase());
    if (!(COLUMNS_SORT as readonly string[]).includes(col ?? '')) continue;
    if (levels.some((n) => n.column === col)) continue;
    levels.push({ column: col as ColumnSort, order: direction === 'asc' || direction === 'desc' ? direction : byDefault });
  }
  return levels.length ? levels : [{ column: 'received_at', order: byDefault }];
}

/** ORDER BY clause of the levels (empty values last, ties broken by decreasing id). */
function orderSql(levels: LevelSort[]): string {
  const parts = levels.map(({ column, order }) => {
    const collation = column === 'title' || column === 'company' ? 'COLLATE NOCASE ' : '';
    return `(o.${column} IS NULL), o.${column} ${collation}${order.toUpperCase()}`;
  });
  if (!levels.some((n) => n.column === 'id')) parts.push('o.id DESC');
  return parts.join(', ');
}

export interface LineList extends Omit<Offer, 'description'> {
  tags: string[];
  has_description: boolean;
}

export interface ResultList {
  total: number;
  page: number;
  size: number;
  pages: number;
  offers: LineList[];
}

export const SIZE_MAX = 500;

/** Safe FTS5 query: each word in quotes, with prefix search. */
export function requestFts(text: string): string | null {
  const words = text
    .split(/[\s"'’()*:^+\-,.;!?]+/u)
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
  if (!words.length) return null;
  return words.map((m) => `"${m.replace(/"/g, '""')}"*`).join(' ');
}

function clauses(f: Filters): { where: string[]; params: (string | number)[] } {
  const where: string[] = [];
  const params: (string | number)[] = [];
  const list = (col: string, values: string[] | undefined) => {
    const v = (values ?? []).filter(Boolean);
    if (!v.length) return;
    where.push(`${col} IN (${v.map(() => '?').join(', ')})`);
    params.push(...v);
  };
  if (f.myApplications) list('o.status', STATUSES_APPLICATION);
  list('o.status', f.statuses);
  list('o.source', f.sources);
  if (f.scoreMin !== undefined && Number.isFinite(f.scoreMin)) {
    where.push('o.score >= ?');
    params.push(f.scoreMin);
  }
  if (f.scoreMax !== undefined && Number.isFinite(f.scoreMax)) {
    where.push('o.score <= ?');
    params.push(f.scoreMax);
  }
  if (f.unscored === true) where.push('o.score IS NULL');
  if (f.unscored === false) where.push('o.score IS NOT NULL');
  if (f.contract) {
    where.push("o.contract LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLike(f.contract)}%`);
  }
  if (f.remote) {
    where.push("o.remote LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLike(f.remote)}%`);
  }
  if (f.receivedFrom) {
    where.push('o.received_at >= ?');
    params.push(f.receivedFrom);
  }
  if (f.receivedUntil) {
    where.push('o.received_at <= ?');
    params.push(`${f.receivedUntil}￿`);
  }
  if (f.publishedFrom) {
    where.push('o.published_at >= ?');
    params.push(f.publishedFrom);
  }
  if (f.publishedUntil) {
    where.push('o.published_at <= ?');
    params.push(`${f.publishedUntil}￿`);
  }
  for (const tag of (f.tags ?? []).filter(Boolean)) {
    where.push('EXISTS (SELECT 1 FROM offer_tags ot JOIN tags t ON t.id = ot.tag_id WHERE ot.offer_id = o.id AND t.name = ?)');
    params.push(tag);
  }
  const fts = f.q ? requestFts(f.q) : null;
  if (fts) {
    where.push('o.id IN (SELECT rowid FROM offers_fts WHERE offers_fts MATCH ?)');
    params.push(fts);
  }
  return { where, params };
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function listOffers(db: Database, o: OptionsList = {}): ResultList {
  const size = Math.min(Math.max(Math.trunc(o.size ?? 50), 1), SIZE_MAX);
  const page = Math.max(Math.trunc(o.page ?? 1), 1);
  const { where, params } = clauses(o);
  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM offers o ${sqlWhere}`).get(...params) as { n: number }).n;
  const lines = db
    .prepare(
      `SELECT o.id, o.source, o.site_id, o.canonical_url, o.title, o.company, o.location, o.contract, o.compensation,
              o.compensation_min, o.compensation_max, o.compensation_unit, o.remote, o.published_at, o.received_at,
              o.stack, o.origin, o.status, o.score, o.created_at, o.updated_at,
              (o.description IS NOT NULL AND o.description <> '') AS has_description,
              (SELECT group_concat(t.name, ',') FROM offer_tags ot JOIN tags t ON t.id = ot.tag_id WHERE ot.offer_id = o.id) AS tags
       FROM offers o ${sqlWhere}
       ORDER BY ${orderSql(levelsSort(o.sort, o.order))}
       LIMIT ? OFFSET ?`,
    )
    .all(...params, size, (page - 1) * size) as unknown as (Omit<LineList, 'tags' | 'has_description'> & {
    tags: string | null;
    has_description: number;
  })[];
  return {
    total,
    page,
    size,
    pages: Math.max(1, Math.ceil(total / size)),
    offers: lines.map((l) => ({
      ...l,
      has_description: Boolean(l.has_description),
      tags: l.tags ? l.tags.split(',').sort() : [],
    })),
  };
}

export interface Meta {
  total: number;
  statuses: { value: string; n: number }[];
  sources: { value: string; n: number }[];
  tags: { value: string; n: number }[];
  contracts: { value: string; n: number }[];
}

/** Values present in the database, for the filter lists. */
export function meta(db: Database): Meta {
  const count = (sql: string) => db.prepare(sql).all() as unknown as { value: string; n: number }[];
  return {
    total: (db.prepare('SELECT COUNT(*) AS n FROM offers').get() as { n: number }).n,
    statuses: count('SELECT status AS value, COUNT(*) AS n FROM offers GROUP BY status ORDER BY n DESC'),
    sources: count('SELECT source AS value, COUNT(*) AS n FROM offers GROUP BY source ORDER BY n DESC'),
    tags: count('SELECT t.name AS value, COUNT(*) AS n FROM offer_tags ot JOIN tags t ON t.id = ot.tag_id GROUP BY t.name ORDER BY t.name'),
    contracts: count(
      "SELECT contract AS value, COUNT(*) AS n FROM offers WHERE contract IS NOT NULL AND contract <> '' GROUP BY contract ORDER BY n DESC LIMIT 30",
    ),
  };
}
