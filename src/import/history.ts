// Import of the Markdown / JSON history of a data folder (read only on these files):
// candidatures/_lots/*.json, candidatures/_ecartees.md, candidatures/_SUIVI.md.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import type { Database } from '../db/database.ts';
import { transaction } from '../db/database.ts';
import { canonicalize } from '../core/links.ts';
import { batchInputs, scoreInput, type InputBatch } from '../core/scoring.ts';
import { addScore, addStatus, applicationOf, saveApplication, saveOffer, mergeOffers, updateTags, findOffer, type Offer } from '../core/offers.ts';
import type { Status } from '../core/statuses.ts';
import { dateFr, fingerprint, isEmpty, now, withoutMarkdown } from '../core/text.ts';
import { linksMarkdown, linesTables } from './markdown.ts';
import { column, excerpt, readConditions, registerLineOffers, withoutLinkList } from './cells.ts';
import { MARKER_TRACKER_GENERATED } from '../export/tracker.ts';
import { importJournals, type ReportJournal } from './journal.ts';
import { AppError } from '../core/errors.ts';
import { t } from '../i18n/index.ts';

// The reading of the cells moved to cells.ts: exported from here too, for the callers of this module.
export { cellCompanies, cellScores, readConditions, registerLineOffers } from './cells.ts';

export interface UnrecognizedLine {
  file: string;
  line: number;
  reason: string;
  excerpt: string;
}

export interface ReportImport {
  batches: { files: number; inputs: number; offers_created: number; scores_added: number; errors: UnrecognizedLine[] };
  register: {
    lines: number;
    offers: number;
    offers_created: number;
    offers_without_link: number;
    companies_corrected: number;
    statuses_added: number;
    scores_added: number;
    links_not_recognized: { line: number; url: string }[];
    unrecognized: UnrecognizedLine[];
  };
  tracker: {
    lines: number;
    offers_created: number;
    applications: number;
    /** Reason why _SUIVI.md was not read again (generated file). */
    ignore?: string;
    merges: { offer: number; duplicate: number; company: string }[];
    statuses_added: number;
    scores_added: number;
    unrecognized: UnrecognizedLine[];
  };
  /** Journals of the application folders ("Suivi" sections). */
  journal: ReportJournal;
}

function reportEmpty(): Omit<ReportImport, 'journal'> {
  return {
    batches: { files: 0, inputs: 0, offers_created: 0, scores_added: 0, errors: [] },
    register: {
      lines: 0,
      offers: 0,
      offers_created: 0,
      offers_without_link: 0,
      companies_corrected: 0,
      statuses_added: 0,
      scores_added: 0,
      links_not_recognized: [],
      unrecognized: [],
    },
    tracker: { lines: 0, offers_created: 0, applications: 0, merges: [], statuses_added: 0, scores_added: 0, unrecognized: [] },
  };
}

// ---------------------------------------------------------------------------------------------
// Scored batches (_lots/*.json)
// ---------------------------------------------------------------------------------------------

function importBatches(db: Database, folder: string, report: ReportImport): void {
  const dir = join(folder, 'candidatures', '_lots');
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)
    .filter((x) => x.endsWith('.json'))
    .sort()) {
    report.batches.files++;
    const path = join(dir, f);
    const date = f.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? statSync(path).mtime.toISOString().slice(0, 10);
    let inputs: InputBatch[];
    try {
      // Batches of an earlier history are taken as they are: their fields are not validated like a new score.
      inputs = batchInputs(JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''))) as InputBatch[];
    } catch (e) {
      report.batches.errors.push({ file: f, line: 0, reason: (e as Error).message, excerpt: '' });
      continue;
    }
    transaction(db, () => {
      inputs.forEach((e, i) => {
        report.batches.inputs++;
        try {
          const r = scoreInput(db, e, {
            origin: 'import-batch',
            originOffer: 'import-batch',
            at: date,
            ifMissing: true,
            receivedAt: date,
          });
          if (r.created) report.batches.offers_created++;
          if (r.score_added) report.batches.scores_added++;
        } catch (err) {
          report.batches.errors.push({ file: f, line: i + 1, reason: (err as Error).message, excerpt: excerpt(e.url ?? '') });
        }
      });
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Register of the dismissed offers (_ecartees.md)
// ---------------------------------------------------------------------------------------------

function importRegister(db: Database, folder: string, report: ReportImport): void {
  const path = join(folder, 'candidatures', '_ecartees.md');
  if (!existsSync(path)) return;
  const R = report.register;
  const lines = linesTables(readFileSync(path, 'utf8'));
  transaction(db, () => {
    for (const l of lines) {
      const date = column(l, 'date');
      const company = column(l, 'entreprise');
      if (date === undefined || company === undefined || l.cells.length !== l.headers.length) {
        R.unrecognized.push({ file: '_ecartees.md', line: l.number, reason: 'ligne hors tableau Date / Entreprise', excerpt: excerpt(l.raw) });
        continue;
      }
      R.lines++;
      const at = dateFr(date);
      const setAside = /mis(es?)? de côté/i.test(l.section);
      const reason = withoutMarkdown(column(l, 'raison') ?? '');
      const status: Status = /^go\b/i.test(reason) ? 'withdrawn' : 'dismissed';
      const comment = [at ? null : 'date inconnue', setAside ? 'mise de côté' : null, reason || null].filter(Boolean).join(' — ');
      const { offers, linksIgnored } = registerLineOffers(l);
      for (const url of linksIgnored) R.links_not_recognized.push({ line: l.number, url });
      for (const o of offers) {
        R.offers++;
        if (!o.url) R.offers_without_link++;
        const { offer, created } = saveOffer(
          db,
          o.source,
          o.siteId,
          { canonical_url: o.url, title: o.title, company: o.company, received_at: at, ...readConditions(o.conditions) },
          'import-register',
        );
        if (created) R.offers_created++;
        // Import from an older version: the whole grouped cell had been taken as the company.
        const cellWhole = [withoutMarkdown(company), withoutMarkdown(withoutLinkList(company))];
        if (!created && offer.company !== o.company && cellWhole.includes(offer.company ?? '')) {
          db.prepare('UPDATE offers SET company = ?, updated_at = ? WHERE id = ?').run(o.company, now(), offer.id);
          R.companies_corrected++;
        }
        if (o.score !== null && !db.prepare('SELECT 1 FROM scores WHERE offer_id = ?').get(offer.id)) {
          addScore(db, offer.id, { score: o.score, gaps: reason || null }, { origin: 'import-register', at: at ?? now() });
          R.scores_added++;
        }
        if (addStatus(db, offer.id, status, { comment, origin: 'import-register', at: at ?? now(), ifMissing: true })) {
          R.statuses_added++;
        }
        if (setAside) updateTags(db, offer.id, ['a-reprendre'], []);
      }
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Application tracker (_SUIVI.md)
// ---------------------------------------------------------------------------------------------

function statusInProgress(status: string, sent: string): Status {
  if (/^\W*(à envoyer|à répondre)/i.test(status) && !dateFr(sent)) return 'go';
  if (/entretien/i.test(status)) return 'interview';
  if (/relance/i.test(status) && dateFr(sent)) return 'followed-up';
  if (dateFr(sent) || /envoy/i.test(status) || /sans nouvelles/i.test(status)) return 'sent';
  return 'go';
}

function statusClosed(issue: string): Status {
  if (/refus|perdue/i.test(issue)) return 'rejected';
  if (/abandonn|écartée avant envoi|mise de côté|cv retiré|non envoyée/i.test(issue)) return 'withdrawn';
  return 'closed';
}

/** First identifiable offer in the application folder (the job ad), if it exists. */
function offerForFolder(dataDir: string, pathRelative: string): ReturnType<typeof canonicalize> {
  const path = join(dataDir, pathRelative);
  if (!existsSync(path) || !statSync(path).isFile()) return null;
  const text = readFileSync(path, 'utf8');
  for (const m of text.matchAll(/https?:\/\/[^\s)<>"'\]]+/g)) {
    const id = canonicalize(m[0]);
    if (id) return id;
  }
  return null;
}

const normalize = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Words of 4 letters or more ("cofondateur", "wordpress"…), to compare two job titles. */
const words = (s: string) =>
  new Set(
    normalize(s)
      .split(' ')
      .filter((m) => m.length >= 4),
  );

/**
 * Offer without a link in the register (source "register") of the same company, whose title shares at least
 * one word with the tracker's. Only if it is unique: otherwise, no attachment.
 */
export function registerTwin(db: Database, company: string, title: string): Offer | null {
  const ent = normalize(company);
  if (!ent) return null;
  const wordsTitle = words(title);
  const candidates = (db.prepare("SELECT * FROM offers WHERE source = 'register'").all() as unknown as Offer[]).filter(
    (o) => normalize(o.company) === ent && [...words(o.title)].some((m) => wordsTitle.has(m)),
  );
  return candidates.length === 1 ? candidates[0] : null;
}

function importTracker(db: Database, folder: string, report: ReportImport): void {
  const path = join(folder, 'candidatures', '_SUIVI.md');
  if (!existsSync(path)) return;
  const S = report.tracker;
  const text = readFileSync(path, 'utf8');
  // After the switch, _SUIVI.md is produced by generate-tracker: the database is the reference, it is not read again.
  if (MARKER_TRACKER_GENERATED.test(text.slice(0, 600))) {
    S.ignore = 'fichier généré par vigie-emploi : la base fait foi';
    return;
  }
  const lines = linesTables(text);
  transaction(db, () => {
    for (const l of lines) {
      const cellOffer = column(l, 'offre');
      if (!cellOffer || l.cells.length !== l.headers.length) {
        S.unrecognized.push({ file: '_SUIVI.md', line: l.number, reason: 'ligne hors tableau « Offre »', excerpt: excerpt(l.raw) });
        continue;
      }
      S.lines++;
      const cellFolder = column(l, 'dossier') ?? '';
      const linkFolder = linksMarkdown(`${cellFolder} ${cellOffer}`).find((x) => !/^https?:/.test(x.url) && /\.md$|\/$/.test(x.url));
      const folderRel = linkFolder ? posix.join('candidatures', posix.dirname(linkFolder.url.replace(/\\/g, '/'))) : null;
      const id = linkFolder ? offerForFolder(folder, posix.join('candidatures', linkFolder.url)) : null;

      const textOffer = withoutMarkdown(withoutLinkList(cellOffer));
      const bold = cellOffer.match(/\*\*([^*]+)\*\*/)?.[1];
      const i = textOffer.indexOf(' — ');
      const company = bold ?? (i > 0 ? textOffer.slice(0, i) : textOffer);
      const title = i > 0 ? textOffer.slice(i + 3) : textOffer;
      const type = column(l, 'type') ?? '';
      const sent = column(l, 'envoy') ?? '';
      const statusText = column(l, 'statut') ?? '';
      const issue = column(l, 'issue') ?? '';
      const sentAt = dateFr(sent);

      let source = id?.source ?? 'tracker';
      let siteId = id?.siteId ?? `suivi-${folderRel ? posix.basename(folderRel) : fingerprint(textOffer)}`;
      if (!id) {
        // Offer without a link already present in the register ("Seyos / ICDC"): it is attached to the register's one,
        // and a duplicate created by a previous import is merged into it.
        const twin = registerTwin(db, company, title);
        if (twin) {
          const old = findOffer(db, source, siteId);
          if (old) {
            mergeOffers(db, twin.id, old.id);
            S.merges.push({ offer: twin.id, duplicate: old.id, company });
          }
          source = twin.source;
          siteId = twin.site_id;
        }
      }
      const { offer, created } = saveOffer(
        db,
        source,
        siteId,
        { canonical_url: id?.url ?? null, title, company, received_at: sentAt, ...readConditions(type) },
        'import-tracker',
      );
      if (created) S.offers_created++;

      let status: Status;
      let comment: string;
      let at: string;
      if (/clos/i.test(l.section)) {
        status = statusClosed(issue);
        comment = withoutMarkdown(withoutLinkList(issue));
        at = dateFr(issue) ?? now();
      } else if (/ancienne/i.test(l.section)) {
        status = 'sent';
        comment = 'sans réponse connue';
        at = sentAt ?? now();
      } else {
        status = statusInProgress(statusText, sent);
        comment = withoutMarkdown(statusText);
        at = status === 'sent' && sentAt && sentAt.length === 10 ? sentAt : now();
      }
      // Imports are replayed: the line is only added if it does not exist yet.
      if (addStatus(db, offer.id, status, { comment, origin: 'import-tracker', at, ifMissing: true })) S.statuses_added++;

      const scoreTracker = `${statusText} ${issue}`.match(/\((\d+(?:[.,]\d+)?)\s*\/\s*10\)/);
      if (scoreTracker && !db.prepare('SELECT 1 FROM scores WHERE offer_id = ?').get(offer.id)) {
        addScore(db, offer.id, { score: Number(scoreTracker[1].replace(',', '.')) }, { origin: 'import-tracker', at });
        S.scores_added++;
      }
      const send = withoutMarkdown(sent);
      const channel = withoutMarkdown(column(l, 'canal') ?? '');
      const action = column(l, 'prochaine');
      const before = applicationOf(db, offer.id);
      // The next action entered in the interface, the CLI or through MCP is not replaced by the import.
      const actionFree = !before?.next_action_origin || before.next_action_origin === 'import-tracker';
      saveApplication(
        db,
        offer.id,
        {
          folder: folderRel ?? undefined,
          // Date alone → YYYY-MM-DD (or YYYY-MM); "≈ 25/08/2026", "après le 20/08/2026" kept as they are.
          sent_at: isEmpty(send) ? null : /^\d{1,2}\/\d{1,2}\/\d{4}$|^\d{1,2}\/\d{4}$/.test(send) ? dateFr(send) : send,
          channel: isEmpty(channel) ? null : channel,
          label: withoutLinkList(cellOffer).replace(/\s+/g, ' ').trim(),
          conditions: isEmpty(type) ? null : type,
          state: (/clos/i.test(l.section) ? issue : statusText).trim() || null,
          next_action: action !== undefined && actionFree ? (isEmpty(withoutMarkdown(action)) ? null : action) : undefined,
        },
        { origin: 'import-tracker' },
      );
      S.applications++;
    }
  });
}

/** Replays the whole import. Idempotent: running it again duplicates neither offers, nor scores, nor statuses. */
export function importHistory(db: Database, dataDir: string): ReportImport {
  const report = reportEmpty() as ReportImport;
  if (!existsSync(join(dataDir, 'candidatures'))) {
    throw new AppError('not-found', t('core.import.withoutFolder', { folder: dataDir }));
  }
  importBatches(db, dataDir, report);
  importRegister(db, dataDir, report);
  importTracker(db, dataDir, report);
  // After the tracker: it is the one that links the offers to their application folder.
  return { ...report, journal: importJournals(db, dataDir) };
}
