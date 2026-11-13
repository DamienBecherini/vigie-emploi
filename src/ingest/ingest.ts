// Ingestion de la boîte de réception : .eml → offres en base, puis suppression des e-mails traités.
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
  /** Garder les .eml après traitement. */
  keep?: boolean;
  /** Lire le JSON-LD des pages Hellowork / Free-Work. */
  download?: boolean;
  excludedTitles?: RegExp[];
  rejectedEmployers?: RegExp[];
  downloader?: Downloader;
  /** Pause entre deux téléchargements (ms). */
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
  /** Nouvelles offres sans description : à lire dans le navigateur. */
  to_read: number;
  /** Nouvelles offres dont la description a été lue (JSON-LD). */
  with_description: number;
  errors: { file?: string; url?: string; message: string }[];
  /** E-mails lus sans aucune offre reconnue : conservés (format inconnu, à signaler). */
  without_offer: string[];
  /**
   * Accusés de réception de candidature : leurs liens ne deviennent pas des offres. `offres_connues` = offres
   * de l'e-mail déjà en base (id, statut). À l'IA de vérifier que la candidature est enregistrée comme envoyée.
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

  // 1. Lecture de tous les e-mails, fusion des offres (la première occurrence garde la date de réception).
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
      // Aucune offre reconnue : format inconnu, l'e-mail est gardé pour ne rien perdre.
      if (email.offers.length === 0) summary.without_offer.push(f);
      else read.push(path);
    } catch (e) {
      summary.errors.push({ file: f, message: (e as Error).message });
    }
  }
  summary.offers_found = offers.size;

  // 2. Tri : doublons (déjà en base), exclusions sur l'intitulé, lecture JSON-LD.
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
      // Offre déjà suivie revue dans une alerte : son statut ne bouge pas, une trace au journal (une par jour).
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

  // 3. Suppression des e-mails lus sans erreur et dont les offres sont en base.
  if (!o.keep) {
    // unlinkSync et non rmSync : sous Windows, rmSync ne supprimait rien, sans erreur, sur certains noms
    // (crochets, « ... »), et l'e-mail revenait au lot suivant. Chaque suppression est vérifiée.
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

/** Ingestion avec les réglages de la configuration (CLI et MCP). */
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
