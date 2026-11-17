// Scoring rubric: file <data>/profil/grille.json (current version), versions in the database (rubrics table),
// bulk rescoring and preview of the impact of a change.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Database } from '../db/database.ts';
import { transaction } from '../db/database.ts';
import { APP_ROOT } from './config.ts';
import type { Language } from '../i18n/tool.ts';
import {
  applyChange,
  computeScore,
  computedExamples,
  META_FILE,
  summaryRules,
  schemaInput,
  validateRubric,
  type Breakdown,
  type ExampleComputed,
  type Rubric,
} from './rubric.ts';
import { recompute } from './offers.ts';
import { now } from './text.ts';
import { LANGUAGE_DEFAULT, t } from '../i18n/index.ts';

export const AUTHORS_RUBRIC = ['interface', 'cli', 'mcp', 'file'] as const;
export type AuthorRubric = (typeof AUTHORS_RUBRIC)[number];

export interface InfoVersion {
  version: number;
  at: string;
  author: AuthorRubric;
  summary: string;
}

export interface VersionRubric extends InfoVersion {
  rubric: Rubric;
}

export const EXAMPLE_RUBRIC = join(APP_ROOT, 'examples', 'rubric.json');

/** Sample rubric of the language: examples/rubric.<language>.json if it exists, otherwise the French one. */
export function exampleRubric(language: Language = LANGUAGE_DEFAULT): string {
  if (language === LANGUAGE_DEFAULT) return EXAMPLE_RUBRIC;
  const translated = join(APP_ROOT, 'examples', `rubric.${language}.json`);
  return existsSync(translated) ? translated : EXAMPLE_RUBRIC;
}

export function pathRubric(dataDir: string): string {
  return join(dataDir, 'profil', 'grille.json');
}

/** Canonical form (to compare two rubrics regardless of the layout). */
function canonical(g: Rubric): string {
  return JSON.stringify(g);
}

/** Reads and validates grille.json; null if it does not exist. The metadata (version, summary…) are separated. */
export function readFileRubric(path: string): { rubric: Rubric; summary: string | null; version: number | null } | null {
  if (!existsSync(path)) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, '')) as Record<string, unknown>;
  } catch (e) {
    throw new Error(t('core.rubricUnreadable', { path, message: (e as Error).message }));
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(t('core.rubricObject', { path }));
  const content = { ...raw };
  for (const k of META_FILE) delete content[k];
  return {
    rubric: validateRubric(content, path),
    summary: typeof raw.summary === 'string' ? raw.summary : null,
    version: typeof raw.version === 'number' ? raw.version : null,
  };
}

/** Writes grille.json (current version, with its metadata on top), atomically. */
export function writeFileRubric(path: string, v: VersionRubric): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  const body = { version: v.version, modified_at: v.at, summary: v.summary, ...v.rubric };
  writeFileSync(tmp, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  renameSync(tmp, path);
}

interface LineRubric {
  version: number;
  content: string;
  at: string;
  author: AuthorRubric;
  summary: string;
}

function versionOfLine(l: LineRubric): VersionRubric {
  return { version: l.version, at: l.at, author: l.author, summary: l.summary, rubric: validateRubric(JSON.parse(l.content), `version ${l.version}`) };
}

export function lastVersion(db: Database): VersionRubric | null {
  const l = db.prepare('SELECT * FROM rubrics ORDER BY version DESC LIMIT 1').get() as LineRubric | undefined;
  return l ? versionOfLine(l) : null;
}

export function versionRubric(db: Database, version: number): VersionRubric {
  const l = db.prepare('SELECT * FROM rubrics WHERE version = ?').get(version) as LineRubric | undefined;
  if (!l) throw new Error(t('core.versionNotFound', { version }));
  return versionOfLine(l);
}

/** History of the versions, from the most recent to the oldest. */
export function historyRubric(db: Database): InfoVersion[] {
  return db.prepare('SELECT version, at, author, summary FROM rubrics ORDER BY version DESC').all() as unknown as InfoVersion[];
}

function insertVersion(db: Database, rubric: Rubric, author: AuthorRubric, summary: string): VersionRubric {
  const r = summary.trim();
  if (!r) throw new Error(t('core.summaryChange'));
  const previous = (db.prepare('SELECT MAX(version) AS v FROM rubrics').get() as { v: number | null }).v ?? 0;
  const v: VersionRubric = { version: previous + 1, at: now(), author, summary: r, rubric };
  db.prepare('INSERT INTO rubrics (version, content, at, author, summary) VALUES (?, ?, ?, ?, ?)').run(
    v.version,
    JSON.stringify(rubric),
    v.at,
    author,
    v.summary,
  );
  return v;
}

/**
 * Current rubric, after synchronizing the file and the database:
 * - file present, empty database → version 1 (author "file");
 * - file modified by hand → new version (author "file"), scores recomputed;
 * - file missing, database not empty → the file is rewritten from the last version.
 * null if there is a rubric neither in the file nor in the database.
 */
export function rubricCurrent(db: Database, dataDir: string): VersionRubric | null {
  const path = pathRubric(dataDir);
  const file = readFileRubric(path);
  const dbVersion = lastVersion(db);
  if (!file) {
    if (dbVersion) writeFileRubric(path, dbVersion);
    return dbVersion;
  }
  if (dbVersion && canonical(dbVersion.rubric) === canonical(file.rubric)) {
    if (file.version !== dbVersion.version) writeFileRubric(path, dbVersion);
    return dbVersion;
  }
  const summary = dbVersion ? t('core.rubricModifiedFile') : (file.summary ?? t('core.rubricInitial'));
  const v = transaction(db, () => {
    const nv = insertVersion(db, file.rubric, 'file', summary);
    rescoreWith(db, nv);
    return nv;
  });
  writeFileRubric(path, v);
  return v;
}

/** Like rubricCurrent, but throws a clear error if there is no rubric. */
export function rubricRequired(db: Database, dataDir: string): VersionRubric {
  const g = rubricCurrent(db, dataDir);
  if (!g) {
    throw new Error(t('core.notOfRubric', { path: pathRubric(dataDir) }));
  }
  return g;
}

/** Copies the sample rubric into the data folder if no rubric exists. */
export function initializeRubric(db: Database, dataDir: string, language: Language = LANGUAGE_DEFAULT): { created: boolean; path: string; version: VersionRubric } {
  const path = pathRubric(dataDir);
  const created = !existsSync(path) && !lastVersion(db);
  if (created) {
    mkdirSync(dirname(path), { recursive: true });
    copyFileSync(exampleRubric(language), path);
  }
  return { created, path, version: rubricRequired(db, dataDir) };
}

// ---------------------------------------------------------------------------------------------
// Rescoring and preview

interface ScoreToCompute {
  score_id: number;
  offer_id: number;
  title: string;
  company: string | null;
  score: number | null;
  input: string;
  remote: string | null;
  compensation_min: number | null;
  compensation_max: number | null;
  compensation_unit: string | null;
}

/** Last score of each offer, when it has sub-scores (overall scores stay frozen). */
function scoresToCompute(db: Database): ScoreToCompute[] {
  return db
    .prepare(
      `SELECT n.id AS score_id, o.id AS offer_id, o.title, o.company, n.score, n.input, o.remote,
              o.compensation_min, o.compensation_max, o.compensation_unit
       FROM offers o
       JOIN scores n ON n.id = (SELECT id FROM scores WHERE offer_id = o.id ORDER BY scored_at DESC, id DESC LIMIT 1)
       WHERE n.input IS NOT NULL`,
    )
    .all() as unknown as ScoreToCompute[];
}

export interface ChangeScore {
  id: number;
  title: string;
  company: string | null;
  before: number | null;
  after: number;
}

export interface Impact {
  /** Offers whose last score has sub-scores (the ones that are recomputed). */
  offers_recalculated: number;
  /** Offers whose displayed score changes. */
  changed: number;
  threshold_before: number | null;
  threshold_after: number;
  /** Go above the threshold (≥) / fall back below it. */
  rising: ChangeScore[];
  falling: ChangeScore[];
  /** The changes, from the largest to the smallest (100 at most). */
  changes: ChangeScore[];
}

function compute(n: ScoreToCompute, v: { rubric: Rubric; version: number | null }): Breakdown {
  const input = schemaInput.parse(JSON.parse(n.input));
  return computeScore(v.rubric, input, n, v.version);
}

function measure(lines: { n: ScoreToCompute; d: Breakdown }[], thresholdBefore: number | null, thresholdAfter: number): Impact {
  const changes: ChangeScore[] = [];
  const rising: ChangeScore[] = [];
  const falling: ChangeScore[] = [];
  for (const { n, d } of lines) {
    if (n.score === d.score) continue;
    const c = { id: n.offer_id, title: n.title, company: n.company, before: n.score, after: d.score };
    changes.push(c);
  }
  for (const { n, d } of lines) {
    const before = n.score !== null && n.score >= (thresholdBefore ?? thresholdAfter);
    const after = d.score >= thresholdAfter;
    const c = { id: n.offer_id, title: n.title, company: n.company, before: n.score, after: d.score };
    if (!before && after) rising.push(c);
    if (before && !after) falling.push(c);
  }
  changes.sort((a, b) => Math.abs(b.after - (b.before ?? 0)) - Math.abs(a.after - (a.before ?? 0)) || a.id - b.id);
  return {
    offers_recalculated: lines.length,
    changed: changes.length,
    threshold_before: thresholdBefore,
    threshold_after: thresholdAfter,
    rising,
    falling,
    changes: changes.slice(0, 100),
  };
}

/** What a rubric would change, without writing anything. */
export function previewRubric(db: Database, rubric: Rubric, thresholdBefore: number | null): Impact {
  const lines = scoresToCompute(db).map((n) => ({ n, d: compute(n, { rubric, version: null }) }));
  return measure(lines, thresholdBefore, rubric.threshold);
}

/** Recomputes (in place) the last score of each offer that has sub-scores. */
function rescoreWith(db: Database, v: VersionRubric, thresholdBefore: number | null = null): Impact {
  const lines = scoresToCompute(db).map((n) => ({ n, d: compute(n, v) }));
  const updated = db.prepare(
    `UPDATE scores SET score = ?, exact_score = ?, raw_score = ?, penalties = ?, breakdown = ?, rubric_version = ?, recalculated_at = ?
     WHERE id = ?`,
  );
  const at = now();
  for (const { n, d } of lines) {
    updated.run(d.score, d.exact_score, d.average, summaryRules(d), JSON.stringify(d), String(v.version), at, n.score_id);
    if (n.score !== d.score) recompute(db, n.offer_id);
  }
  return measure(lines, thresholdBefore ?? v.rubric.threshold, v.rubric.threshold);
}

/** Bulk rescoring with the current rubric. */
export function rescore(db: Database, dataDir: string): { version: number; impact: Impact } {
  const v = rubricRequired(db, dataDir);
  return { version: v.version, impact: transaction(db, () => rescoreWith(db, v)) };
}

/** Saves a new version (file + database), then recomputes the scores. */
export function saveRubric(
  db: Database,
  dataDir: string,
  raw: unknown,
  o: { author: AuthorRubric; summary: string },
): { version: VersionRubric; impact: Impact } {
  const rubric = validateRubric(raw);
  const before = rubricCurrent(db, dataDir);
  if (before && canonical(before.rubric) === canonical(rubric)) throw new Error(t('core.noneChange'));
  const r = transaction(db, () => {
    const v = insertVersion(db, rubric, o.author, o.summary);
    return { version: v, impact: rescoreWith(db, v, before?.rubric.threshold ?? null) };
  });
  writeFileRubric(pathRubric(dataDir), r.version);
  return r;
}

/** Partial change (MCP tool, CLI): dry run = preview only, otherwise save. */
export function updateRubric(
  db: Database,
  dataDir: string,
  change: unknown,
  o: { author: AuthorRubric; summary: string; dry_run?: boolean },
): { saved: boolean; version: number; rubric: Rubric; impact: Impact; computed_examples: ExampleComputed[] } {
  const current = rubricRequired(db, dataDir);
  const rubric = applyChange(current.rubric, change);
  const before = { rubric: current.rubric, version: current.version };
  if (o.dry_run) {
    return {
      saved: false,
      version: current.version,
      rubric,
      impact: previewRubric(db, rubric, current.rubric.threshold),
      // Reference examples recomputed with the trial rubric: useful even on a database still empty.
      computed_examples: computedExamples(rubric, null, before),
    };
  }
  const r = saveRubric(db, dataDir, rubric, o);
  return {
    saved: true,
    version: r.version.version,
    rubric: r.version.rubric,
    impact: r.impact,
    computed_examples: computedExamples(r.version.rubric, r.version.version, before),
  };
}

/** Back to a previous version: its content becomes a new version. */
export function restoreRubric(
  db: Database,
  dataDir: string,
  version: number,
  o: { author: AuthorRubric; summary?: string },
): { version: VersionRubric; impact: Impact } {
  const old = versionRubric(db, version);
  return saveRubric(db, dataDir, old.rubric, { author: o.author, summary: o.summary?.trim() || t('core.backVersion', { version }) });
}
