// Reprise de l'historique Markdown / JSON d'un dossier de données (lecture seule sur ces fichiers) :
// candidatures/_lots/*.json, candidatures/_ecartees.md, candidatures/_SUIVI.md.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import type { Database } from '../db/database.ts';
import { transaction } from '../db/database.ts';
import { canonicalize } from '../core/links.ts';
import { inputsOfBatch, scoreInput } from '../core/scoring.ts';
import {
  addScore,
  addStatus,
  applicationOf,
  saveApplication,
  saveOffer,
  mergeOffers,
  updateTags,
  findOffer,
  type FieldsOffer,
  type Offer,
} from '../core/offers.ts';
import type { Status } from '../core/statuses.ts';
import { dateFr, fingerprint, isEmpty, now, withoutMarkdown, findCompensation } from '../core/text.ts';
import { split, linksMarkdown, linesTables, type LineTable } from './markdown.ts';
import { MARKER_TRACKER_GENERATED } from '../export/tracker.ts';
import { importJournals, type ReportJournal } from './journal.ts';

export interface LineNotRecognized {
  file: string;
  line: number;
  reason: string;
  excerpt: string;
}

export interface ReportImport {
  batches: { files: number; inputs: number; offers_created: number; scores_added: number; errors: LineNotRecognized[] };
  register: {
    lines: number;
    offers: number;
    offers_created: number;
    offers_without_link: number;
    companies_corrected: number;
    statuses_added: number;
    scores_added: number;
    links_not_recognized: { line: number; url: string }[];
    unrecognized: LineNotRecognized[];
  };
  tracker: {
    lines: number;
    offers_created: number;
    applications: number;
    /** Raison pour laquelle _SUIVI.md n'a pas été relu (fichier généré). */
    ignore?: string;
    merges: { offer: number; duplicate: number; company: string }[];
    statuses_added: number;
    scores_added: number;
    unrecognized: LineNotRecognized[];
  };
  /** Journaux des dossiers de candidature (sections « Suivi »). */
  journal: ReportJournal;
}

const excerpt = (s: string) => (s.length > 160 ? `${s.slice(0, 157)}…` : s);

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

/** Cellule d'une ligne par nom de colonne (début du libellé, sans casse ni accents). */
function column(l: LineTable, ...names: string[]): string | undefined {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .trim();
  for (const name of names) {
    const i = l.headers.findIndex((e) => norm(e).startsWith(norm(name)));
    if (i >= 0) return l.cells[i];
  }
  return undefined;
}

/** Notes d'une cellule « 6/10 », « 6 et 5,5/10 », « 7 · 6,5 · 4 » ; vide si ambiguë (« 4 à 7/10 », « ≤ 2,5 »). */
export function scoresOfCell(cell: string): number[] {
  if (/[≤≥<>~≈]|(^|\s)à(\s|$)/.test(cell)) return [];
  return (cell.replace(/\/\s*10/g, '').match(/\d+(?:[.,]\d+)?/g) ?? [])
    .map((n) => Number(n.replace(',', '.')))
    .filter((n) => n >= 0 && n <= 10);
}

/** Contrat, rémunération et télétravail lus dans une cellule « Conditions » ou « Type ». */
export function readConditions(text: string): Pick<FieldsOffer, 'contract' | 'compensation' | 'remote'> {
  const t = withoutMarkdown(text);
  const contract = t.match(/\b(CDI|CDD|freelance|indépendant|portage|stage|alternance|intérim)\b/i)?.[1] ?? null;
  const tt =
    t.match(/(full remote|100 % (?:télétravail|remote)|full télétravail|full TT|télétravail[^,;·]*|remote[^,;·]*|hybride[^,;·]*)/i)?.[1] ??
    null;
  return {
    contract: contract ? contract.charAt(0).toUpperCase() + contract.slice(1) : null,
    compensation: findCompensation(t),
    remote: tt ? tt.trim() : null,
  };
}

/** Retire de la cellule les parenthèses qui ne contiennent que des liens « ([offre](…), [doublon](…)) ». */
function withoutListOfLinks(s: string): string {
  return s.replace(/\s*\(\s*(?:\[[^\]]*\]\([^)\s]*\)\s*,?\s*)+\)/g, '').replace(/\[[^\]]*\]\([^)\s]*\)/g, '');
}

// ---------------------------------------------------------------------------------------------
// Lots notés (_lots/*.json)
// ---------------------------------------------------------------------------------------------

function importBatches(db: Database, folder: string, report: ReportImport): void {
  const dir = join(folder, 'candidatures', '_lots');
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    report.batches.files++;
    const path = join(dir, f);
    const date = f.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? statSync(path).mtime.toISOString().slice(0, 10);
    let inputs;
    try {
      inputs = inputsOfBatch(JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, '')));
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
// Registre des offres écartées (_ecartees.md)
// ---------------------------------------------------------------------------------------------

interface OfferRegister {
  source: string;
  siteId: string;
  url: string | null;
  title: string;
  company: string;
  conditions: string;
  score: number | null;
}

/**
 * Entreprises d'une cellule groupée du registre : séparées par « · » ou « / », sinon une par bloc en gras
 * (« **A** (filiale), **B** »). `pieces` : une entrée par entreprise ; `parOffre` : « (×3) » compte trois fois.
 */
export function companiesOfCell(cell: string): { parts: string[]; byOffer: string[] } {
  let parts = split(cell, ' · ');
  if (parts.length < 2) parts = split(cell, ' / ');
  if (parts.length < 2) {
    const bold = [...cell.matchAll(/\*\*[^*]+\*\*/g)];
    if (bold.length >= 2) {
      parts = bold.map((m, i) =>
        cell
          .slice(m.index, bold[i + 1]?.index ?? cell.length)
          .replace(/[\s,;]+$/, '')
          .replace(/\s+(et|and)$/i, ''),
      );
    }
  }
  const MULTIPLE = /\s*\(\s*[×x]\s*(\d+)\s*\)/i;
  const byOffer: string[] = [];
  const names = parts.map((p) => {
    const times = p.match(MULTIPLE);
    const name = withoutMarkdown(p.replace(MULTIPLE, ''));
    for (let i = 0; i < (times ? Number(times[1]) : 1); i++) byOffer.push(name);
    return name;
  });
  return { parts: names, byOffer };
}

const keyLink = (url: string): string | null => {
  const id = canonicalize(url);
  return id ? `${id.source}:${id.siteId}` : null;
};

export function offersOfLineRegister(l: LineTable): { offers: OfferRegister[]; linksIgnored: string[] } {
  const company = column(l, 'entreprise') ?? '';
  const machine = column(l, 'poste') ?? '';
  const conditions = column(l, 'conditions') ?? '';
  const scores = scoresOfCell(column(l, 'note') ?? '');
  const segments = split(machine, ' · ');
  const isBatch = /^lot\b/i.test(withoutMarkdown(company));
  const { parts: companies, byOffer } = companiesOfCell(company);
  // Sinon, une entreprise par lien d'offre (dans l'ordre) quand les nombres concordent ; à défaut, la cellule entière.
  const linksJob = new Set(segments.flatMap((seg) => linksMarkdown(seg).map((x) => keyLink(x.url)).filter((x) => x !== null)));
  const bySegment = companies.length === segments.length;
  const byLink = !isBatch && !bySegment && byOffer.length > 1 && byOffer.length === linksJob.size;
  let rank = 0;
  const conds = split(conditions, ' · ');
  const offers: OfferRegister[] = [];
  const linksIgnored: string[] = [];
  const seen = new Set<string>();

  segments.forEach((seg, k) => {
    const text = withoutMarkdown(withoutListOfLinks(seg));
    let ent = bySegment ? companies[k] : withoutMarkdown(company);
    let title = text;
    if (isBatch && text.includes(' — ')) {
      const i = text.indexOf(' — ');
      ent = text.slice(0, i).trim();
      title = text.slice(i + 3).trim();
    }
    const score = scores.length === segments.length ? scores[k] : scores.length === 1 ? scores[0] : null;
    const cond = conds.length === segments.length ? conds[k] : conditions;
    for (const link of linksMarkdown(seg)) {
      const id = canonicalize(link.url);
      if (!id) {
        if (/^https?:/.test(link.url)) linksIgnored.push(link.url);
        continue;
      }
      const key = `${id.source}:${id.siteId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const entLink = byLink ? byOffer[rank++] : ent;
      offers.push({ source: id.source, siteId: id.siteId, url: id.url, title, company: entLink, conditions: cond, score });
    }
  });
  // Liens placés dans les autres colonnes (entreprise, conditions).
  for (const link of linksMarkdown(`${company} ${conditions}`)) {
    const id = canonicalize(link.url);
    if (!id) {
      if (/^https?:/.test(link.url)) linksIgnored.push(link.url);
      continue;
    }
    const key = `${id.source}:${id.siteId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    offers.push({
      source: id.source,
      siteId: id.siteId,
      url: id.url,
      title: withoutMarkdown(withoutListOfLinks(machine)),
      company: withoutMarkdown(withoutListOfLinks(company)),
      conditions,
      score: scores.length === 1 ? scores[0] : null,
    });
  }
  if (!offers.length) {
    // Ligne sans lien d'offre : une offre « registre » identifiée par son contenu, pour garder l'historique.
    const date = column(l, 'date') ?? '';
    offers.push({
      source: 'register',
      siteId: `reg-${fingerprint(`${date}|${withoutMarkdown(company)}|${withoutMarkdown(machine)}`)}`,
      url: null,
      title: withoutMarkdown(withoutListOfLinks(machine)) || withoutMarkdown(company),
      company: withoutMarkdown(withoutListOfLinks(company)),
      conditions,
      score: scores.length === 1 ? scores[0] : null,
    });
  }
  return { offers, linksIgnored };
}

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
      const comment = [at ? null : 'date inconnue', setAside ? 'mise de côté' : null, reason || null]
        .filter(Boolean)
        .join(' — ');
      const { offers, linksIgnored } = offersOfLineRegister(l);
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
        // Reprise d'une ancienne version : la cellule groupée entière avait été prise comme entreprise.
        const cellWhole = [withoutMarkdown(company), withoutMarkdown(withoutListOfLinks(company))];
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
// Suivi des candidatures (_SUIVI.md)
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

/** Première offre identifiable dans le dossier de candidature (l'annonce), s'il existe. */
function offerOfFolder(dataDir: string, pathRelative: string): ReturnType<typeof canonicalize> {
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

/** Mots de 4 lettres ou plus (« cofondateur », « wordpress »…), pour comparer deux intitulés. */
const words = (s: string) => new Set(normalize(s).split(' ').filter((m) => m.length >= 4));

/**
 * Offre sans lien du registre (source « registre ») de la même entreprise, dont l'intitulé partage au moins
 * un mot avec celui du suivi. Seulement si elle est unique : sinon, pas de rattachement.
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
  // Après la bascule, _SUIVI.md est produit par generer-suivi : la base fait foi, on ne le relit pas.
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
      const id = linkFolder ? offerOfFolder(folder, posix.join('candidatures', linkFolder.url)) : null;

      const textOffer = withoutMarkdown(withoutListOfLinks(cellOffer));
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
        // Offre sans lien déjà présente dans le registre (« Seyos / ICDC ») : on la rattache à celle du registre,
        // et un doublon créé par une reprise précédente y est fusionné.
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
        comment = withoutMarkdown(withoutListOfLinks(issue));
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
      // Les imports se rejouent : on n'ajoute la ligne que si elle n'existe pas déjà.
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
      // La prochaine action saisie dans l'interface, la CLI ou par MCP n'est pas remplacée par la reprise.
      const actionFree = !before?.next_action_origin || before.next_action_origin === 'import-tracker';
      saveApplication(
        db,
        offer.id,
        {
          folder: folderRel ?? undefined,
          // Date seule → AAAA-MM-JJ (ou AAAA-MM) ; « ≈ 25/08/2026 », « après le 20/08/2026 » gardés tels quels.
          sent_at: isEmpty(send) ? null : /^\d{1,2}\/\d{1,2}\/\d{4}$|^\d{1,2}\/\d{4}$/.test(send) ? dateFr(send) : send,
          channel: isEmpty(channel) ? null : channel,
          label: withoutListOfLinks(cellOffer).replace(/\s+/g, ' ').trim(),
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

/** Rejoue toute la reprise. Idempotent : relancer ne duplique ni offres, ni notes, ni statuts. */
export function importHistory(db: Database, dataDir: string): ReportImport {
  const report = reportEmpty() as ReportImport;
  if (!existsSync(join(dataDir, 'candidatures'))) {
    throw new Error(`Dossier candidatures/ introuvable dans ${dataDir}`);
  }
  importBatches(db, dataDir, report);
  importRegister(db, dataDir, report);
  importTracker(db, dataDir, report);
  // Après le suivi : c'est lui qui relie les offres à leur dossier de candidature.
  return { ...report, journal: importJournals(db, dataDir) };
}
