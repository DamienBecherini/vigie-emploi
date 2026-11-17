// Command-line interface of vigie-emploi (designed to be driven by an AI: stable JSON outputs).
// Messages follow the configured language ("language" key, French by default); command, option and
// status names are English identifiers, and the --json outputs do not change with the language.
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { loadConfig, languageConfigured, normalizeLanguage, type Config } from '../core/config.ts';
import { openDatabase, type Database } from '../db/database.ts';
import { ingestPerConfig } from '../ingest/ingest.ts';
import { importHistory } from '../import/history.ts';
import { listOffers, type OptionsList } from '../core/queries.ts';
import {
  addStatus,
  detailOffer,
  updateLink,
  updateTags,
  offerById,
  type FieldsApplication,
  type DetailOffer,
} from '../core/offers.ts';
import { batchInputs, type InputBatch } from '../core/scoring.ts';
import { scoreOffers, offersToRead, prepareApplication, trackApplication } from '../core/actions.ts';
import { isStatus, STATUSES } from '../core/statuses.ts';
import { writeTracker } from '../export/tracker.ts';
import { startServer } from '../api/server.ts';
import {
  addEvent,
  deadlines,
  eventOrError,
  journal,
  markDone,
  TYPES_EVENT,
  type EventJournal,
  type EventInput,
} from '../core/events.ts';
import { filesFolder } from '../core/files.ts';
import { statistics } from '../core/statistics.ts';
import { instructionsAi, scoreExample, type Breakdown } from '../core/rubric.ts';
import {
  pathRubric,
  rubricCurrent,
  rubricRequired,
  historyRubric,
  initializeRubric,
  updateRubric,
  rescore,
  restoreRubric,
  versionRubric,
  type Impact,
} from '../core/rubric-storage.ts';
import { defaultWorkspace, initializeWorkspace } from '../init/init.ts';
import { countText } from '../core/count.ts';
import { chooseTemplate, TEMPLATE_DEFAULT, generateCv, listTemplates, findBrowser } from '../cv/cv.ts';
import { decimal, defineLanguage, isLanguage, languageCurrent, LANGUAGES, t } from '../i18n/index.ts';
import { labelLevel, labelStatus, labelType, messageFlag } from '../i18n/labels.ts';
import { analyzePages } from '../cv/pages.ts';
import { commandMail } from './mail.ts';
import { messageMailError } from '../mail/settings.ts';
import { MailError } from '../mail/fetch.ts';

function help(): string {
  return t('cli.help', { statuses: STATUSES.join(', '), types: TYPES_EVENT.join('|') });
}

type Values = Record<string, string | boolean | string[] | undefined>;

function error(message: string): never {
  throw Object.assign(new Error(message), { user: true });
}

function json(x: unknown): void {
  process.stdout.write(`${JSON.stringify(x, null, 2)}\n`);
}

function whole(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) error(t('cli.invalid', { name, value: String(v) }));
  return n;
}

function number(v: unknown, name: string): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) error(t('cli.invalid', { name, value: String(v) }));
  return n;
}

function list(v: unknown): string[] | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function truncate(s: string | null | undefined, n: number): string {
  const x = (s ?? '').replace(/\s+/g, ' ');
  return x.length > n ? `${x.slice(0, n - 1)}…` : x;
}

function table(headers: string[], lines: string[][]): string {
  const widths = headers.map((e, i) => Math.max(e.length, ...lines.map((l) => (l[i] ?? '').length)));
  const line = (l: string[]) => l.map((c, i) => (c ?? '').padEnd(widths[i])).join('  ').trimEnd();
  return [line(headers), widths.map((w) => '-'.repeat(w)).join('  '), ...lines.map(line)].join('\n');
}

/** Date of an event: "05/11/2026 14 h 30" (French) or "05/11/2026 14:30" (English). */
function dateEvent(at: string): string {
  const m = at.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return at;
  const hour = m[4] ? ` ${t('tracker.hour', { h: m[4], m: m[5] })}` : '';
  return `${m[3]}/${m[2]}/${m[1]}${hour}`;
}

const GENERAL_OPTIONS = {
  data: { type: 'string' },
  config: { type: 'string' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const;

function analyze(args: string[], options: Record<string, { type: 'string' | 'boolean'; short?: string; multiple?: boolean }>) {
  const { values, positionals } = parseArgs({
    args,
    options: { ...GENERAL_OPTIONS, ...options },
    allowPositionals: true,
    allowNegative: true,
    strict: true,
  });
  return { v: values as Values, pos: positionals };
}

interface Context {
  config: Config;
  db: Database;
}

function context(v: Values): Context {
  const config = loadConfig({
    dataDir: v.data as string | undefined,
    fileConfig: v.config as string | undefined,
  });
  return { config, db: openDatabase(config.database) };
}

function showDetail(d: DetailOffer): string {
  const l: string[] = [];
  const language = languageCurrent();
  l.push(`#${d.id} ${d.title}${d.company ? ` — ${d.company}` : ''}`);
  l.push(t('cli.detail.status', { status: labelStatus(d.status, language), score: d.score ?? '—', source: d.source, site_id: d.site_id }));
  if (d.canonical_url) l.push(t('cli.detail.url', { url: d.canonical_url }));
  const info = [d.location, d.contract, d.compensation, d.remote && t('cli.detail.remote', { value: d.remote })].filter(Boolean);
  if (info.length) l.push(info.join(' · '));
  l.push(t('cli.detail.dates', { received: d.received_at ?? '—', published: d.published_at ?? '—' }));
  if (d.stack) l.push(t('cli.detail.stack', { stack: d.stack }));
  if (d.tags.length) l.push(t('cli.detail.tags', { tags: d.tags.join(', ') }));
  const n = d.scores[0];
  if (n?.breakdown) {
    l.push(
      '',
      t('cli.detail.scoreRubric', { score: n.score, version: n.rubric_version, exact: n.exact_score, at: n.scored_at }),
      ...linesBreakdown(n.breakdown),
    );
    if (n.fit) l.push(t('cli.detail.fit', { text: n.fit }));
    if (n.gaps) l.push(t('cli.detail.gaps', { text: n.gaps }));
  } else if (n) {
    l.push(
      '',
      t('cli.detail.scoreOld', {
        score: n.score ?? '—',
        raw: n.raw_score ?? '—',
        penalties: n.penalties ? t('cli.detail.penalties', { penalties: n.penalties }) : '',
        at: n.scored_at,
      }),
    );
    if (n.fit) l.push(t('cli.detail.fit', { text: n.fit }));
    if (n.gaps) l.push(t('cli.detail.gaps', { text: n.gaps }));
  }
  if (d.application) {
    const c = d.application;
    const infoApplication = [c.folder, c.channel, c.sent_at && t('cli.detail.sentAt', { date: c.sent_at })].filter(Boolean).join(' · ');
    l.push('', t('cli.detail.application', { info: infoApplication }));
    if (c.next_action) l.push(t('cli.detail.nextAction', { text: c.next_action }));
  }
  if (d.events.length) l.push('', t('cli.detail.journal'), ...d.events.map(lineJournal));
  if (d.statuses.length) {
    l.push('', t('cli.detail.history'));
    for (const s of d.statuses) l.push(`  ${s.at.slice(0, 10)}  ${s.status.padEnd(10)} ${truncate(s.comment, 100)}`);
  }
  if (d.description) l.push('', t('cli.detail.description'), d.description);
  return l.join('\n');
}

function comma(n: number, d = 2): string {
  return decimal(n, languageCurrent(), d);
}

/** Breakdown of a score: one criterion per line, then rules and flags. */
function linesBreakdown(d: Breakdown): string[] {
  const l = d.criteria.map(
    (c) =>
      `  ${c.label.padEnd(26)} ${comma(c.score, 1).padStart(4)} × ${String(Math.round(c.normalized_weight * 100)).padStart(3)} % = ${comma(c.contribution).padStart(5)}` +
      `  ${c.origin === 'neutral' ? t('cli.breakdown.neutral') : c.origin === 'interface' ? t('cli.breakdown.main') : ''}${truncate(c.justification, 90)}`,
  );
  l.push(`  ${t('cli.breakdown.average').padEnd(26)} ${comma(d.average)}`);
  for (const r of d.rules) {
    const effect = r.effect === 'zero' ? '0' : t('cli.breakdown.cap', { value: comma(r.value!) });
    l.push(`  ${t('cli.breakdown.rule', { label: r.label, effect, withoutEffect: r.effective ? '' : t('cli.breakdown.withoutEffect') })}`);
  }
  for (const b of d.ignored_blockers) l.push(`  ${t('cli.breakdown.ignored', { rule: b })}`);
  for (const f of d.flags) l.push(`  ⚑ ${messageFlag(f, languageCurrent())}`);
  l.push(`  ${t('cli.breakdown.score', { exact: comma(d.exact_score), score: comma(d.score, 1) })}`);
  return l;
}

function showImpact(i: Impact): void {
  console.log(t('cli.impact.summary', { recalculated: i.offers_recalculated, changed: i.changed }));
  const line = (c: Impact['changes'][number]) =>
    `  #${String(c.id).padEnd(5)} ${String(c.before ?? '—').padStart(4)} → ${String(c.after).padEnd(4)} ${truncate(`${c.company ?? ''} ${c.title}`, 80)}`;
  const threshold = i.threshold_after;
  if (i.rising.length) console.log(`${t('cli.impact.rising', { threshold, n: i.rising.length })}\n${i.rising.map(line).join('\n')}`);
  if (i.falling.length) console.log(`${t('cli.impact.falling', { threshold, n: i.falling.length })}\n${i.falling.map(line).join('\n')}`);
}

function lineJournal(e: EventJournal): string {
  const state = (e.overdue ? t('cli.journal.overdue') : e.deadline ? t('cli.journal.toDo') : '').padEnd(10);
  const direction = e.direction ? ` ${e.direction === 'sent' ? '→' : '←'}` : '';
  const amount = e.amount !== null ? ` · ${e.amount} ${e.unit ?? ''}`.trimEnd() : '';
  const files = e.files.length ? ` · ${e.files.join(', ')}` : '';
  return `  #${String(e.id).padEnd(5)} ${dateEvent(e.at).padEnd(19)} ${state}${e.type.padEnd(11)}${direction} ${truncate(e.summary, 90)}${amount}${files}`;
}

function withoutError<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    error((e as Error).message);
  }
}

const commands: Record<string, (args: string[]) => Promise<void> | void> = {
  async mail(args) {
    const { v, pos } = analyze(args, {
      address: { type: 'string' },
      host: { type: 'string' },
      port: { type: 'string' },
      insecure: { type: 'boolean' },
      folder: { type: 'string' },
      'since-days': { type: 'string' },
      'mark-seen': { type: 'boolean' },
      'password-stdin': { type: 'boolean' },
    });
    await commandMail(pos[0], v, context(v), json);
  },
  async ingest(args) {
    const { v } = analyze(args, { keep: { type: 'boolean' }, fetch: { type: 'boolean' }, mail: { type: 'boolean' }, emails: { type: 'string' } });
    const { config, db } = context(v);
    const r = await ingestPerConfig(db, config, {
      folderEmails: v.emails as string | undefined,
      keep: Boolean(v.keep),
      download: v.fetch === false ? false : undefined,
      mail: v.mail !== false,
    });
    if (v.json) return json(r);
    if (r.mail?.error) console.log(t('cli.ingest.mailError', { message: messageMailError(new MailError(r.mail.error, r.mail.message), { host: config.mail?.host ?? '', folder: r.mail.folder }) }));
    else if (r.mail) {
      console.log(t('cli.ingest.mail', { n: r.mail.fetched, folder: r.mail.folder }));
      if (r.mail.more) console.log(t('cli.ingest.mailMore'));
    }
    console.log(
      t('cli.ingest.summary', {
        files: r.files,
        offers: r.offers_found,
        added: r.added,
        withDescription: r.with_description,
        toRead: r.to_read,
        duplicates: r.duplicates,
        dismissed: r.dismissed,
      }),
    );
    console.log(v.keep ? t('cli.ingest.kept') : t('cli.ingest.deleted', { n: r.files_deleted }));
    for (const e of r.detail.dismissed) console.log(t('cli.ingest.dismissed', { id: e.id, title: truncate(e.title, 70), pattern: e.pattern }));
    for (const e of r.errors) console.log(t('cli.ingest.error', { file: e.file ?? e.url, message: e.message }));
    for (const f of r.without_offer) console.log(t('cli.ingest.withoutOffer', { file: f }));
    for (const c of r.confirmations) {
      const known = c.known_offers.map((x) => `#${x.id} (${x.status})`).join(', ');
      console.log(t('cli.ingest.acknowledgment', { subject: c.subject, more: known ? ` → ${known}` : t('cli.ingest.offerMissing') }));
    }
    if (r.added) console.log(t('cli.ingest.suite'));
  },

  'import-history'(args) {
    const { v } = analyze(args, { source: { type: 'string' } });
    const { config, db } = context(v);
    const r = importHistory(db, (v.source as string | undefined) ?? config.dataDir);
    if (v.json) return json(r);
    console.log(t('cli.import.batches', { files: r.batches.files, inputs: r.batches.inputs, offers: r.batches.offers_created, scores: r.batches.scores_added }));
    console.log(
      t('cli.import.register', {
        lines: r.register.lines,
        offers: r.register.offers,
        created: r.register.offers_created,
        withoutLink: r.register.offers_without_link,
        statuses: r.register.statuses_added,
        scores: r.register.scores_added,
        corrected: r.register.companies_corrected,
      }),
    );
    if (r.tracker.ignore) console.log(t('cli.import.trackerIgnore', { reason: r.tracker.ignore }));
    else
      console.log(
        t('cli.import.tracker', { lines: r.tracker.lines, offers: r.tracker.offers_created, applications: r.tracker.applications, statuses: r.tracker.statuses_added }),
      );
    const J = r.journal;
    console.log(
      t('cli.import.journals', {
        folders: J.folders,
        lines: J.lines,
        created: J.events_created,
        existing: J.events_existing,
        duplicate: J.events_duplicate.length,
        removed: J.events_removed,
        deadlines: J.deadlines,
        types: Object.entries(J.by_type).map(([x, n]) => `${x} ${n}`).join(', ') || '—',
      }),
    );
    for (const d of J.folders_attached) console.log(t('cli.import.attached', { offer: d.offer_id, folder: d.folder }));
    for (const d of J.folders_without_offer) console.log(t('cli.import.withoutOffer', { folder: d }));
    for (const d of J.folders_without_tracker) console.log(t('cli.import.withoutTracker', { folder: d }));
    if (J.untyped.length) {
      console.log(t('cli.import.untyped', { n: J.untyped.length }));
      for (const n of J.untyped) console.log(`  ${n.folder}:${n.line} ${n.excerpt}`);
    }
    if (J.without_date.length) {
      console.log(t('cli.import.withoutDate', { n: J.without_date.length }));
      for (const n of J.without_date) console.log(`  ${n.folder}:${n.line} ${n.excerpt}`);
    }
    for (const f of r.tracker.merges) console.log(t('cli.import.merge', { duplicate: f.duplicate, offer: f.offer, company: f.company }));
    const not = [...r.batches.errors, ...r.register.unrecognized, ...r.tracker.unrecognized];
    if (not.length) {
      console.log(t('cli.import.unrecognized', { n: not.length }));
      for (const n of not) console.log(`  ${n.file}:${n.line} ${n.reason} — ${n.excerpt}`);
    }
    if (r.register.links_not_recognized.length) {
      console.log(t('cli.import.linksNotRecognized', { n: r.register.links_not_recognized.length }));
      for (const n of r.register.links_not_recognized) console.log(`  _ecartees.md:${n.line} ${n.url}`);
    }
  },

  list(args) {
    const { v } = analyze(args, {
      status: { type: 'string' },
      'score-min': { type: 'string' },
      'score-max': { type: 'string' },
      'unscored': { type: 'boolean' },
      source: { type: 'string' },
      tag: { type: 'string' },
      from: { type: 'string' },
      until: { type: 'string' },
      'published-from': { type: 'string' },
      text: { type: 'string', short: 'q' },
      contract: { type: 'string' },
      remote: { type: 'string' },
      applications: { type: 'boolean' },
      page: { type: 'string' },
      size: { type: 'string' },
      sort: { type: 'string' },
      order: { type: 'string' },
    });
    const { db } = context(v);
    const statuses = list(v.status);
    for (const s of statuses ?? []) if (!isStatus(s)) error(t('cli.statusUnknown', { status: s }));
    const o: OptionsList = {
      statuses,
      sources: list(v.source),
      tags: list(v.tag),
      scoreMin: number(v['score-min'], 'score-min'),
      scoreMax: number(v['score-max'], 'score-max'),
      unscored: v.unscored === true ? true : v.unscored === false ? false : undefined,
      receivedFrom: v.from as string | undefined,
      receivedUntil: v.until as string | undefined,
      publishedFrom: v['published-from'] as string | undefined,
      q: v.text as string | undefined,
      contract: v.contract as string | undefined,
      remote: v.remote as string | undefined,
      myApplications: Boolean(v.applications),
      page: v.page ? whole(v.page, 'page') : 1,
      size: v.size ? whole(v.size, 'size') : 50,
      sort: (v.sort as string | undefined) ?? 'received_at',
      order: v.order === 'asc' ? 'asc' : 'desc',
    };
    const r = listOffers(db, o);
    if (v.json) return json(r);
    console.log(
      table(
        t('cli.list.headers').split('|'),
        r.offers.map((x) => [
          String(x.id),
          x.score === null ? '—' : String(x.score),
          x.status,
          x.source,
          x.received_at ?? '',
          truncate(x.company, 24),
          truncate(x.title, 60),
        ]),
      ),
    );
    console.log(t('cli.list.footer', { page: r.page, pages: r.pages, total: r.total }));
  },

  show(args) {
    const { v, pos } = analyze(args, {});
    const { db } = context(v);
    const d = detailOffer(db, whole(pos[0], 'id'));
    if (!d) error(t('cli.offerNotFound', { id: pos[0] }));
    if (v.json) return json(d);
    console.log(showDetail(d));
  },

  'to-read'(args) {
    const { v } = analyze(args, { limit: { type: 'string' }, full: { type: 'boolean' } });
    const { db } = context(v);
    const r = offersToRead(db, { limit: v.limit ? whole(v.limit, 'limit') : 500, full: Boolean(v.full) });
    const offers = r.offers;
    if (v.json) return json(r);
    if (!offers.length) return console.log(t('cli.toRead.none'));
    for (const o of offers) {
      const mode = { description: t('cli.toRead.description'), browser: t('cli.toRead.browser'), human: t('cli.toRead.human') }[o.reading];
      console.log(`#${o.id} [${o.source}] ${truncate(o.title, 80)}${o.company ? ` — ${o.company}` : ''}`);
      console.log(`    ${o.url ?? t('cli.toRead.withoutUrl')} · ${mode}`);
    }
    console.log(t('cli.toRead.total', { n: r.total }));
  },

  score(args) {
    const { v, pos } = analyze(args, { file: { type: 'string' }, json: { type: 'string' }, dry_run: { type: 'boolean' } });
    const { config, db } = context(v);
    let inputs: InputBatch[];
    if (v.file) {
      inputs = batchInputs(JSON.parse(readFileSync(v.file as string, 'utf8').replace(/^﻿/, '')));
    } else {
      if (typeof v.json !== 'string') error(t('cli.score.expected'));
      const e = JSON.parse(v.json) as InputBatch | InputBatch[];
      inputs = Array.isArray(e) ? e : [e];
      if (pos[0]) {
        if (inputs.length !== 1) error(t('cli.score.oneSingle'));
        inputs[0] = { ...inputs[0], id: whole(pos[0], 'id') };
      }
    }
    const results = withoutError(() =>
      scoreOffers(db, inputs, 'cli', { rubric: () => rubricCurrent(db, config.dataDir), dry_run: Boolean(v.dry_run) }),
    );
    json({ ok: true, dry_run: Boolean(v.dry_run), scored: v.dry_run ? 0 : results.length, offers: results });
  },

  rubric(args) {
    const { v } = analyze(args, {
      instructions: { type: 'boolean' },
      history: { type: 'boolean' },
      version: { type: 'string' },
      restore: { type: 'string' },
      init: { type: 'boolean' },
      update: { type: 'string' },
      summary: { type: 'string' },
      dry_run: { type: 'boolean' },
    });
    const { config, db } = context(v);
    const folder = config.dataDir;
    if (v.init) {
      const r = withoutError(() => initializeRubric(db, folder, config.language));
      if (v.json) return json({ ok: true, created: r.created, path: r.path, version: r.version.version });
      return console.log(r.created ? t('cli.rubric.copied', { path: r.path }) : t('cli.rubric.exists', { path: r.path }));
    }
    if (v.history) {
      withoutError(() => rubricCurrent(db, folder));
      const h = historyRubric(db);
      if (v.json) return json({ ok: true, versions: h });
      for (const x of h) console.log(`  v${String(x.version).padEnd(4)} ${x.at.slice(0, 16).replace('T', ' ')}  ${x.author.padEnd(9)} ${x.summary}`);
      return;
    }
    if (v.restore !== undefined) {
      const r = withoutError(() => restoreRubric(db, folder, whole(v.restore, 'version'), { author: 'cli', summary: v.summary as string | undefined }));
      if (v.json) return json({ ok: true, version: r.version.version, impact: r.impact });
      console.log(t('cli.rubric.version', { version: r.version.version, summary: r.version.summary }));
      return showImpact(r.impact);
    }
    if (v.update !== undefined) {
      if (!v.dry_run && !v.summary) error(t('cli.rubric.summaryExpected'));
      let change: unknown;
      try {
        change = JSON.parse(v.update as string);
      } catch (e) {
        error(t('cli.rubric.jsonInvalid', { message: (e as Error).message }));
      }
      const r = withoutError(() => updateRubric(db, folder, change, { author: 'cli', summary: (v.summary as string) ?? '', dry_run: Boolean(v.dry_run) }));
      if (v.json) return json({ ok: true, ...r });
      console.log(r.saved ? t('cli.rubric.saved', { version: r.version }) : t('cli.rubric.dry_run'));
      if (r.computed_examples.length) {
        console.log(t('cli.rubric.examplesBeforeAfter'));
        for (const e of r.computed_examples) {
          const before = e.before === null || e.before === undefined ? t('cli.rubric.new') : comma(e.before);
          console.log(`  ${before.padStart(7)} → ${comma(e.score).padEnd(4)} ${e.title}${e.company ? ` — ${e.company}` : ''}`);
        }
      }
      return showImpact(r.impact);
    }
    const g = v.version !== undefined ? withoutError(() => versionRubric(db, whole(v.version, 'version'))) : withoutError(() => rubricRequired(db, folder));
    if (v.json) {
      return json({
        ok: true,
        file: pathRubric(folder),
        ...g,
        instructions_ai: instructionsAi(g.rubric),
        computed_examples: g.rubric.examples.map((e) => ({ title: e.title, company: e.company ?? null, ...scoreExample(g.rubric, e, g.version) })),
      });
    }
    const G = g.rubric;
    const language = languageCurrent();
    console.log(t('cli.rubric.title', { name: G.name, version: g.version, at: g.at.slice(0, 10), author: g.author, summary: g.summary }));
    console.log(t('cli.rubric.file', { path: pathRubric(folder), threshold: comma(G.threshold) }));
    const sum = G.criteria.reduce((s, c) => s + c.weight, 0);
    console.log(`\n${t('cli.rubric.criteria')}`);
    for (const c of G.criteria) {
      const source = (c.source === 'ai' ? t('cli.rubric.ai') : t('cli.rubric.computation')).padEnd(8);
      console.log(`  ${c.id.padEnd(14)} ${String(Math.round((c.weight / sum) * 100)).padStart(3)} %  ${source}  ${c.label}`);
    }
    const tt = G.scales.remote;
    const r = G.scales.compensation;
    console.log(`\n${t('cli.rubric.remote', { days: tt.onsite_days.join(' / '), unknown: tt.unknown })}`);
    console.log(
      t('cli.rubric.compensation', {
        reference: r.reference,
        floor: r.salary.floor,
        low: r.salary.target_low,
        high: r.salary.target_high,
        daily_rate: r.daily_rate.floor,
        fullRemote: r.daily_rate.floor_full_remote ? t('cli.rubric.fullRemote', { value: r.daily_rate.floor_full_remote }) : '',
        tjmLow: r.daily_rate.target_low,
        tjmHigh: r.daily_rate.target_high,
        unknown: r.unknown,
      }),
    );
    console.log(`\n${t('cli.rubric.rules')}`);
    for (const x of G.rules) {
      const effect = x.effect === 'zero' ? '0' : x.effect === 'cap' ? t('cli.breakdown.cap', { value: x.value }) : `${x.criterion} < ${x.threshold}`;
      console.log(`  ${x.active ? '●' : '○'} ${x.id.padEnd(18)} ${effect.padEnd(10)} ${x.label}`);
    }
    console.log(`\n${t('cli.rubric.inventory')}`);
    for (const n of ['strong', 'medium', 'light', 'zero'] as const) {
      const items = G.inventory.filter((x) => x.level === n).map((x) => x.technology);
      if (items.length) console.log(`  ${labelLevel(n, language).padEnd(6)} ${items.join(', ')}`);
    }
    if (G.examples.length) {
      console.log(`\n${t('cli.rubric.examples')}`);
      for (const e of G.examples) console.log(`  ${comma(scoreExample(G, e).score, 1).padStart(4)}  ${e.company ? `${e.company} — ` : ''}${e.title}`);
    }
    if (v.instructions) console.log(`\n${t('cli.rubric.instructions')}\n${[...G.instructions, ...instructionsAi(G)].map((x) => `- ${x}`).join('\n')}`);
  },

  rescore(args) {
    const { v } = analyze(args, {});
    const { config, db } = context(v);
    const r = withoutError(() => rescore(db, config.dataDir));
    if (v.json) return json({ ok: true, ...r });
    console.log(t('cli.rescore', { version: r.version }));
    showImpact(r.impact);
  },

  status(args) {
    const { v, pos } = analyze(args, { comment: { type: 'string', short: 'm' } });
    const { db } = context(v);
    const id = whole(pos[0], 'id');
    const status = pos[1];
    if (!status || !isStatus(status)) error(t('cli.statusExpected', { statuses: STATUSES.join(', ') }));
    if (!offerById(db, id)) error(t('cli.offerNotFound', { id }));
    addStatus(db, id, status, { comment: (v.comment as string | undefined) ?? null, origin: 'cli' });
    const o = offerById(db, id)!;
    if (v.json) return json({ ok: true, id, status: o.status });
    console.log(`#${id} → ${labelStatus(o.status, languageCurrent())}`);
  },

  tag(args) {
    // Manual parsing: "-removal" must not be taken for an option.
    const opts: Values = {};
    const rest: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--json') opts.json = true;
      else if (a === '--data' || a === '--config') opts[a.slice(2)] = args[++i];
      else rest.push(a);
    }
    const { db } = context(opts);
    const id = whole(rest[0], 'id');
    if (!offerById(db, id)) error(t('cli.offerNotFound', { id }));
    const additions = rest.slice(1).filter((x) => x.startsWith('+')).map((x) => x.slice(1));
    const removals = rest.slice(1).filter((x) => x.startsWith('-')).map((x) => x.slice(1));
    const others = rest.slice(1).filter((x) => !/^[+-]/.test(x));
    if (others.length) error(t('cli.tag.prefix', { tags: others.join(' ') }));
    const tags = updateTags(db, id, additions, removals);
    if (opts.json) return json({ ok: true, id, tags });
    console.log(`#${id} : ${tags.join(', ') || t('cli.tag.none')}`);
  },

  link(args) {
    const { v, pos } = analyze(args, {});
    const { db } = context(v);
    const id = whole(pos[0], 'id');
    if (!offerById(db, id)) error(t('cli.offerNotFound', { id }));
    if (pos[1] === undefined) error(t('cli.link.expected'));
    try {
      updateLink(db, id, pos[1] === '-' ? null : pos[1]);
    } catch (e) {
      error((e as Error).message);
    }
    const o = offerById(db, id)!;
    if (v.json) return json({ ok: true, id, url: o.canonical_url });
    console.log(`#${id} : ${o.canonical_url ?? t('cli.link.none')}`);
  },

  apply(args) {
    const { v, pos } = analyze(args, {});
    const { config, db } = context(v);
    const id = whole(pos[0], 'id');
    const r = withoutError(() => prepareApplication(db, config.dataDir, id, 'cli'));
    if (v.json) return json(r);
    console.log(showDetail(r.offer));
    console.log(`\n${t('cli.apply.folder', { folder: r.suggested_folder })}`);
    console.log(r.steps.map((e, i) => `${i + 1}. ${e}`).join('\n'));
  },

  application(args) {
    const { v, pos } = analyze(args, {
      folder: { type: 'string' },
      cv: { type: 'string' },
      channel: { type: 'string' },
      'sent-at': { type: 'string' },
      message: { type: 'string' },
      'next-action': { type: 'string' },
    });
    const { db } = context(v);
    const id = whole(pos[0], 'id');
    const fields: FieldsApplication = {
      folder: v.folder as string | undefined,
      cv: v.cv as string | undefined,
      channel: v.channel as string | undefined,
      sent_at: v['sent-at'] as string | undefined,
      message: v.message as string | undefined,
      next_action: v['next-action'] as string | undefined,
    };
    if (Object.values(fields).every((x) => x === undefined)) error(t('cli.application.option'));
    const r = withoutError(() => trackApplication(db, id, fields, 'cli'));
    if (v.json) return json({ ok: true, id, status: r.offer.status, status_added: r.status_added, application: r.offer.application });
    console.log(showDetail(r.offer).split(`\n\n${t('cli.detail.description')}`)[0]);
  },

  'next-action'(args) {
    const { v, pos } = analyze(args, {});
    const { db } = context(v);
    const id = whole(pos[0], 'id');
    if (pos[1] === undefined) error(t('cli.nextAction.expected'));
    const text = pos.slice(1).join(' ');
    const r = withoutError(() => trackApplication(db, id, { next_action: text === '-' ? null : text }, 'cli'));
    const action = r.offer.application?.next_action ?? null;
    if (v.json) return json({ ok: true, id, next_action: action });
    console.log(`#${id} : ${action ?? t('cli.nextAction.none')}`);
  },

  event(args) {
    const { v, pos } = analyze(args, {
      type: { type: 'string', short: 't' },
      at: { type: 'string' },
      summary: { type: 'string', short: 'r' },
      direction: { type: 'string' },
      details: { type: 'string' },
      channel: { type: 'string' },
      contacts: { type: 'string' },
      amount: { type: 'string' },
      unit: { type: 'string' },
      days: { type: 'string' },
      file: { type: 'string', multiple: true },
      done: { type: 'boolean' },
    });
    const { db } = context(v);
    const id = whole(pos[0], 'id');
    if (!v.type) error(t('cli.event.typeExpected', { types: TYPES_EVENT.join(', ') }));
    if (!v.summary) error(t('cli.event.summaryExpected'));
    const input: EventInput = {
      type: v.type as string,
      at: v.at as string | undefined,
      summary: v.summary as string,
      direction: v.direction as string | undefined,
      details: v.details as string | undefined,
      channel: v.channel as string | undefined,
      contacts: v.contacts as string | undefined,
      amount: v.amount as string | undefined,
      unit: v.unit as string | undefined,
      days: v.days as string | undefined,
      files: v.file as unknown as string[] | undefined,
      done: v.done as boolean | undefined,
    };
    const e = withoutError(() => addEvent(db, id, input, 'cli'));
    if (v.json) return json({ ok: true, event: e });
    console.log(
      t('cli.event.added', { id: e.id, offer: id, at: dateEvent(e.at), type: e.type, deadline: e.done ? '' : t('cli.event.deadline'), summary: e.summary }),
    );
  },

  journal(args) {
    const { v, pos } = analyze(args, {});
    const { db } = context(v);
    const id = whole(pos[0], 'id');
    const o = offerById(db, id);
    if (!o) error(t('cli.offerNotFound', { id }));
    const j = journal(db, id);
    if (v.json) return json({ ok: true, id, events: j });
    console.log(`#${id} ${o.title}${o.company ? ` — ${o.company}` : ''}`);
    if (!j.length) return console.log(t('cli.journal.empty'));
    for (const e of j) console.log(lineJournal(e));
  },

  deadlines(args) {
    const { v } = analyze(args, { days: { type: 'string' } });
    const { db } = context(v);
    const r = withoutError(() => deadlines(db, { days: v.days !== undefined ? Number(v.days) : 7 }));
    if (v.json) return json({ ok: true, ...r });
    const language = languageCurrent();
    const line = (e: (typeof r.upcoming)[number]) =>
      `  #${String(e.id).padEnd(5)} ${dateEvent(e.at).padEnd(19)} ${t('cli.deadlines.offer', { id: e.offer_id })} ${truncate(e.company ?? e.title, 28).padEnd(28)} ${labelType(e.type, language)} : ${truncate(e.summary, 80)}`;
    console.log(t('cli.deadlines.overdue', { n: r.overdue.length }));
    for (const e of r.overdue) console.log(line(e));
    console.log(t('cli.deadlines.upcoming', { date: dateEvent(r.until), n: r.upcoming.length }));
    for (const e of r.upcoming) console.log(line(e));
  },

  done(args) {
    const { v, pos } = analyze(args, { done: { type: 'boolean' } });
    const { db } = context(v);
    const id = whole(pos[0], 'event_id');
    withoutError(() => eventOrError(db, id));
    const e = markDone(db, id, v.done !== false);
    if (v.json) return json({ ok: true, event: e });
    console.log(t(e.done ? 'cli.done.done' : 'cli.done.reopened', { id, summary: e.summary }));
  },

  files(args) {
    const { v, pos } = analyze(args, {});
    const { config, db } = context(v);
    const id = whole(pos[0], 'id');
    if (!offerById(db, id)) error(t('cli.offerNotFound', { id }));
    const r = filesFolder(db, config.dataDir, id);
    if (v.json) return json({ ok: true, ...r });
    if (!r.folder) return console.log(t('cli.files.withoutFolder', { id }));
    if (!r.exists) return console.log(t('cli.files.absent', { id, folder: r.folder }));
    console.log(t('cli.files.title', { folder: r.folder, n: r.files.length }));
    for (const f of r.files) {
      console.log(`  ${f.path.padEnd(70)} ${String(Math.ceil(f.size / 1024)).padStart(5)} ${t('cli.files.ko')}  ${f.modified_at.slice(0, 10)}`);
    }
  },

  stats(args) {
    const { v } = analyze(args, {});
    const { db } = context(v);
    const s = statistics(db);
    if (v.json) return json({ ok: true, ...s });
    console.log(t('cli.stats.steps', { sent: s.sent, replies: s.replies, interviews: s.interviews, proposals: s.proposals }));
    console.log(
      s.average_reply_days === null
        ? t('cli.stats.notEnough')
        : t('cli.stats.timeout', { days: comma(s.average_reply_days, 1), n: s.reply_sample_size }),
    );
  },

  'generate-tracker'(args) {
    const { v } = analyze(args, { output: { type: 'string', short: 'o' }, replace: { type: 'boolean' } });
    const { config, db } = context(v);
    const r = writeTracker(db, config.dataDir, { output: v.output as string | undefined, replace: Boolean(v.replace), language: config.language });
    if (v.json) return json({ ok: true, ...r });
    console.log(t('cli.tracker.summary', { file: r.file, inProgress: r.in_progress, noFollowUp: r.no_follow_up, closes: r.closes }));
  },

  async mcp(args) {
    const { v } = analyze(args, {});
    // The server starts even without a workspace (default folder, initialize_workspace tool): no context() here.
    const { startMcp } = await import('../mcp/server.ts');
    await startMcp({ dataDir: v.data as string | undefined, fileConfig: v.config as string | undefined });
  },

  async serve(args) {
    const { v } = analyze(args, { port: { type: 'string' }, idle: { type: 'string' } });
    const { config, db } = context(v);
    const port = v.port ? whole(v.port, 'port') : config.port;
    await startServer({ db, config, port, idleMin: number(v.idle, 'idle') ?? 0 });
  },

  init(args) {
    const { v, pos } = analyze(args, { port: { type: 'string' }, 'mcp-name': { type: 'string' }, template: { type: 'string' }, language: { type: 'string' } });
    if (pos.length > 1) error(t('cli.init.usage'));
    const language = typeof v.language === 'string' ? normalizeLanguage(v.language) : undefined;
    if (language !== undefined && !isLanguage(language)) {
      error(t('cli.invalid', { name: '--language', value: `${String(v.language)} (${LANGUAGES.join(', ')})` }));
    }
    const r = initializeWorkspace({
      folder: pos[0] ?? defaultWorkspace(),
      port: v.port ? whole(v.port, 'port') : undefined,
      mcpName: v['mcp-name'] as string | undefined,
      template: v.template as string | undefined,
      language,
    });
    if (v.json) return json(r);
    console.log(t('cli.init.created', { folder: r.folder }));
    console.log(t('cli.init.config', { config: r.config, port: r.port, language: r.language }));
    console.log(t('cli.init.mcp', { name: r.mcp_name, mcp: r.mcp }));
    console.log(t('cli.init.browser', { browser: r.browser ?? t('cli.none') }));
    for (const a of r.warnings) console.log(`  ⚠ ${a}`);
    console.log(`\n${t('cli.init.command', { command: r.command })}`);
    console.log(`\n${t('cli.init.steps')}`);
    console.log(t('cli.init.step1', { folder: r.folder }));
    console.log(t('cli.init.step2', { folder: r.folder }));
    console.log(`${t('cli.init.step3')}\n`);
    console.log(r.prompt);
  },

  count(args) {
    const { v, pos } = analyze(args, {});
    if (pos.length !== 1) error(t('cli.count.usage'));
    const result = countText(withoutError(() => readFileSync(pos[0], 'utf8')));
    if (v.json) return json({ ok: true, file: pos[0], blocks: result });
    for (const b of result) {
      console.log(t('cli.count.line', { characters: String(b.characters).padStart(6), words: String(b.words).padStart(4), start: b.start }));
    }
  },

  templates(args) {
    const { v } = analyze(args, {});
    const templates = listTemplates();
    if (v.json) return json({ ok: true, templates });
    for (const g of templates) console.log(`${g.name.padEnd(10)} ${g.description}`);
    console.log(`\n${t('cli.templates.choose')}`);
  },

  template(args) {
    const { v, pos } = analyze(args, {});
    if (pos.length !== 1) error(t('cli.template.usage'));
    const workspace = loadConfig({ dataDir: v.data as string | undefined, fileConfig: v.config as string | undefined }).dataDir;
    const r = withoutError(() => chooseTemplate(workspace, pos[0]));
    if (v.json) return json({ ok: true, ...r });
    console.log(t('cli.template.installed', { name: pos[0], folder: r.folder, old: r.old ? t('cli.template.old', { folder: r.old }) : '' }));
    console.log(t('cli.template.regenerate'));
  },

  async cv(args) {
    const { v, pos } = analyze(args, { template: { type: 'string' }, capture: { type: 'boolean' } });
    if (!pos.length) error(t('cli.cv.usage'));
    let chosen = v.template as string | undefined;
    if (!chosen) {
      let workspace: string | null = null;
      try {
        workspace = loadConfig({ dataDir: v.data as string | undefined, fileConfig: v.config as string | undefined }).dataDir;
      } catch {
        workspace = null;
      }
      const local = workspace ? `${workspace}/cv/gabarit` : null;
      chosen = local && existsSync(`${local}/gabarit.css`) ? local : TEMPLATE_DEFAULT;
    }
    const template = chosen;
    const browser = findBrowser();
    if (!browser) error(t('cli.cv.withoutBrowser'));
    const generated = pos.map((md) => withoutError(() => generateCv(md, template, browser, { capture: Boolean(v.capture) })));
    const results = [];
    for (const r of generated) {
      const layout = await analyzePages(readFileSync(r.pdf)).catch(() => null);
      results.push({ ...r, fill: layout?.pages.map((p) => p.fill) ?? null, warnings: layout?.warnings ?? [] });
    }
    if (v.json) return json({ ok: true, template, cv: results });
    for (const r of results) {
      const rate = r.fill
        ? ` (${t('cli.cv.fill', { rate: r.fill.map((x) => t('core.pages.percent', { pc: x })).join(', ') })})`
        : '';
      console.log(`${String(r.pages).padStart(2)} ${t('cli.cv.pages')}  ${r.pdf}${r.pages > 2 ? t('cli.cv.exceeded') : ''}`);
      // Lines read by the tools and the AI (HTML, PDF, IMAGE, PAGES): same labels in both languages.
      if (results.length === 1) console.log(`HTML : ${r.html}\nPDF  : ${r.pdf}${r.capture ? `\nIMAGE : ${r.capture}` : ''}\nPAGES : ${r.pages}${rate}`);
      else if (rate) console.log(`    ${rate.trim()}`);
      for (const a of r.warnings) console.log(`    ! ${a}`);
    }
  },

  help() {
    process.stdout.write(help());
  },
};

/** Value of an option (--name value or --name=value) read before the full parsing. */
function optionRaw(argv: string[], name: string): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${name}`) return argv[i + 1];
    if (argv[i].startsWith(`--${name}=`)) return argv[i].slice(name.length + 3);
  }
  return undefined;
}

/**
 * Language of the messages: init's --language (the workspace being created), otherwise the configuration (--data, --config,
 * VIGIE_EMPLOI_LANGUAGE, file), otherwise French.
 */
function messageLanguage(cmd: string | undefined, args: string[]) {
  const raw = cmd === 'init' ? optionRaw(args, 'language') : undefined;
  const requested = raw === undefined ? undefined : normalizeLanguage(raw);
  if (isLanguage(requested)) return requested;
  return languageConfigured({ dataDir: optionRaw(args, 'data'), fileConfig: optionRaw(args, 'config') });
}

export async function main(argv: string[]): Promise<number> {
  const [cmd, ...args] = argv;
  defineLanguage(messageLanguage(cmd, args));
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    process.stdout.write(help());
    return 0;
  }
  const fn = commands[cmd];
  if (!fn) {
    process.stderr.write(`${t('cli.commandUnknown', { command: cmd })}\n\n${help()}`);
    return 2;
  }
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(help());
    return 0;
  }
  try {
    await fn(args);
    return 0;
  } catch (e) {
    const err = e as Error & { user?: boolean; code?: string };
    const message = err.code?.startsWith('ERR_PARSE_ARGS') || err.user ? err.message : (err.stack ?? err.message);
    if (args.includes('--json')) process.stderr.write(`${JSON.stringify({ ok: false, error: err.message })}\n`);
    else process.stderr.write(`${t('cli.error', { message })}\n`);
    return 1;
  }
}
