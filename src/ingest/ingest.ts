// Ingestion of the inbox: .eml → offers in the database, then deletion of the processed e-mails.
import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Database } from '../db/database.ts';
import type { Config } from '../core/config.ts';
import { transaction } from '../db/database.ts';
import { SOURCES_JSONLD } from '../core/links.ts';
import { addStatus, saveOffer, updateTags, offersOfCompany, findOffer } from '../core/offers.ts';
import { now } from '../core/text.ts';
import { STATUSES_TRACKED } from '../core/statuses.ts';
import { addEvent, dateEventFr, dayLocal } from '../core/events.ts';
import { readEmail, type OfferEmail } from './eml.ts';
import { extractJsonLd, downloadPage, type DetailJsonLd, type Downloader } from './jsonld.ts';
import { t } from '../i18n/index.ts';

export interface OptionsIngest {
  folderEmails: string;
  /** Keep the .eml files after processing. */
  keep?: boolean;
  /** Read the JSON-LD of the Hellowork / Free-Work pages. */
  download?: boolean;
  excludedTitles?: RegExp[];
  rejectedEmployers?: RegExp[];
  downloader?: Downloader;
  /** Pause between two downloads (ms). */
  pause?: number;
}

export interface OfferIngested {
  id: number;
  source: string;
  url: string;
  title: string;
  company: string | null;
  status: string;
  pattern?: string;
  has_description?: boolean;
}

export interface SummaryIngest {
  files: number;
  files_deleted: number;
  offers_found: number;
  added: number;
  duplicates: number;
  dismissed: number;
  /** New offers without a description: to read in the browser. */
  to_read: number;
  /** New offers whose description was read (JSON-LD). */
  with_description: number;
  errors: { file?: string; url?: string; message: string }[];
  /** E-mails read without any recognized offer: kept (unknown format, to report). */
  without_offer: string[];
  /**
   * Application acknowledgments: their links do not become offers. `known_offers` = offers
   * of the e-mail already in the database (id, status). Up to the AI to check that the application is saved as sent.
   */
  confirmations: { file: string; subject: string; date: string | null; offers_known: { id: number; status: string; title: string }[] }[];
  detail: { added: OfferIngested[]; dismissed: OfferIngested[]; duplicates: OfferIngested[] };
}

function patternExclusion(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function ingest(db: Database, o: OptionsIngest): Promise<SummaryIngest> {
  const excludedTitles = o.excludedTitles ?? [];
  const rejected = o.rejectedEmployers ?? [];
  const downloader = o.downloader ?? downloadPage;
  const summary: SummaryIngest = {
    files: 0,
    files_deleted: 0,
    offers_found: 0,
    added: 0,
    duplicates: 0,
    dismissed: 0,
    to_read: 0,
    with_description: 0,
    errors: [],
    without_offer: [],
    confirmations: [],
    detail: { added: [], dismissed: [], duplicates: [] },
  };

  let files: string[];
  try {
    files = readdirSync(o.folderEmails)
      .filter((f) => f.toLowerCase().endsWith('.eml'))
      .sort();
  } catch {
    throw new Error(t('core.ingest.box', { folder: o.folderEmails }));
  }
  summary.files = files.length;

  // 1. Reading of all the e-mails, merge of the offers (the first occurrence keeps the reception date).
  const offers = new Map<string, OfferEmail>();
  const read: string[] = [];
  for (const f of files) {
    const path = join(o.folderEmails, f);
    try {
      const email = await readEmail(readFileSync(path));
      if (email.confirmation) {
        const known = email.offers
          .map((off) => findOffer(db, off.source, off.siteId))
          .filter((x): x is NonNullable<typeof x> => Boolean(x))
          .map((x) => ({ id: x.id, status: x.status, title: x.title }));
        summary.confirmations.push({ file: f, subject: email.subject, date: email.date, offers_known: known });
        read.push(path);
        continue;
      }
      for (const off of email.offers) {
        const already = offers.get(off.url);
        if (!already) offers.set(off.url, off);
        else if (off.title.length > already.title.length) already.title = off.title;
      }
      // No offer recognized: unknown format, the e-mail is kept so that nothing is lost.
      if (email.offers.length === 0) summary.without_offer.push(f);
      else read.push(path);
    } catch (e) {
      summary.errors.push({ file: f, message: (e as Error).message });
    }
  }
  summary.offers_found = offers.size;

  // 2. Sorting: duplicates (already in the database), exclusions on the job title, JSON-LD reading.
  for (const off of offers.values()) {
    const existing = findOffer(db, off.source, off.siteId);
    if (existing) {
      summary.duplicates++;
      summary.detail.duplicates.push({
        id: existing.id,
        source: off.source,
        url: off.url,
        title: existing.title || off.title,
        company: existing.company,
        status: existing.status,
      });
      // An already tracked offer seen again in an alert: its status does not move, a trace in the journal (one per day).
      if (STATUSES_TRACKED.includes(existing.status)) {
        const day = dayLocal();
        const key = `seen:${off.source}:${day}`;
        if (!db.prepare('SELECT 1 FROM events WHERE offer_id = ? AND import_key = ?').get(existing.id, key)) {
          addEvent(
            db,
            existing.id,
            { type: 'note', at: day, done: true, summary: t('core.ingest.seen', { date: dateEventFr(day), source: off.source }), details: off.subject || null },
            'import',
            { importKey: key },
          );
        }
      }
      continue;
    }
    const excluded = patternExclusion(off.title, rejected) ?? patternExclusion(off.title, excludedTitles);
    let pattern = excluded ? t('core.ingest.titleExcluded', { pattern: excluded }) : null;
    let detail: DetailJsonLd | null = null;
    if (!pattern && o.download !== false && SOURCES_JSONLD.includes(off.source)) {
      try {
        detail = extractJsonLd(await downloader(off.url));
        if (!detail) summary.errors.push({ url: off.url, message: t('core.ingest.withoutJsonLd') });
      } catch (e) {
        summary.errors.push({ url: off.url, message: t('core.ingest.readingImpossible', { message: (e as Error).message }) });
      }
      if (o.pause) await wait(o.pause);
      if (detail) {
        const m = patternExclusion(`${detail.company ?? ''} ${(detail.description ?? '').slice(0, 600)}`, rejected);
        if (m) pattern = t('core.ingest.employerRefused', { pattern: m });
      }
    }
    const at = now();
    transaction(db, () => {
      const { offer } = saveOffer(
        db,
        off.source,
        off.siteId,
        {
          canonical_url: off.url,
          title: detail?.title ?? off.title,
          company: detail?.company ?? off.company,
          location: detail?.location ?? off.location,
          contract: detail?.contract,
          compensation: detail?.compensation ?? off.compensation,
          remote: detail?.remote,
          published_at: detail?.published_at,
          description: detail?.description,
          received_at: off.receivedAt,
        },
        'email',
        { at },
      );
      const line: OfferIngested = {
        id: offer.id,
        source: offer.source,
        url: off.url,
        title: offer.title,
        company: offer.company,
        status: 'new',
        has_description: Boolean(offer.description),
      };
      if (pattern) {
        const comment = pattern;
        addStatus(db, offer.id, 'dismissed', { comment, origin: 'ingest', at });
        summary.dismissed++;
        summary.detail.dismissed.push({ ...line, status: 'dismissed', pattern: comment });
      } else {
        addStatus(db, offer.id, 'new', { comment: off.subject ? t('core.ingest.email', { subject: off.subject }) : null, origin: 'ingest', at });
        if (offer.company && offersOfCompany(db, offer.company, offer.id) > 0) {
          updateTags(db, offer.id, ['entreprise-connue'], []);
        }
        summary.added++;
        if (offer.description) summary.with_description++;
        else summary.to_read++;
        summary.detail.added.push(line);
      }
    });
  }

  db.prepare(
    'INSERT INTO ingestions (at, files, added, duplicates, dismissed, errors) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(now(), summary.files, summary.added, summary.duplicates, summary.dismissed, summary.errors.length);

  // 3. Deletion of the e-mails read without error and whose offers are in the database.
  if (!o.keep) {
    // unlinkSync and not rmSync: on Windows, rmSync deleted nothing, without an error, for some names
    // (brackets, "..."), and the e-mail came back in the next batch. Each deletion is checked.
    for (const path of read) {
      try {
        unlinkSync(path);
        if (existsSync(path)) throw new Error(t('core.ingest.alwaysPresent'));
        summary.files_deleted++;
      } catch (e) {
        summary.errors.push({ file: basename(path), message: t('core.ingest.notDeleted', { message: (e as Error).message }) });
      }
    }
  }
  return summary;
}

/** Ingestion with the settings of the configuration (CLI and MCP). */
export function ingestPerConfig(
  db: Database,
  config: Pick<Config, 'emails' | 'fetchJsonLd' | 'excludedTitles' | 'rejectedEmployers'>,
  o: { keep?: boolean; download?: boolean; folderEmails?: string } = {},
): Promise<SummaryIngest> {
  return ingest(db, {
    folderEmails: o.folderEmails ?? config.emails,
    keep: Boolean(o.keep),
    download: o.download === false ? false : config.fetchJsonLd,
    excludedTitles: config.excludedTitles,
    rejectedEmployers: config.rejectedEmployers,
    pause: 400,
  });
}
