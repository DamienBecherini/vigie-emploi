// Import of the application journals: "Suivi" sections of candidatures/*/dossier-candidature.md
// (active folders, not _archives/) → events (origin "import"). Read only on the folders;
// idempotent: each imported line has a fingerprint (import_key) and is only created once.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import type { Database } from '../db/database.ts';
import { transaction } from '../db/database.ts';
import { addEvent, type EventInput, type Direction, type TypeEvent } from '../core/events.ts';
import { fingerprint, withoutMarkdown } from '../core/text.ts';
import { saveApplication } from '../core/offers.ts';
import { cells } from './markdown.ts';

export interface ReportJournal {
  folders: number;
  /** Folders without an offer in the database (no application points to them). */
  folders_without_offer: string[];
  /** Folders attached to the folderless application of the same company (folder name). */
  folders_attached: { folder: string; offer_id: number }[];
  /** Folders without a usable "Suivi" section. */
  folders_without_tracker: string[];
  lines: number;
  events_created: number;
  events_existing: number;
  /** Lines already recorded by hand (CLI, MCP, dashboard): same offer, type and day, compatible direction. Not imported. */
  events_duplicate: { folder: string; line: number; excerpt: string }[];
  /** Events imported from a line that disappeared from the folder (never modified since): deleted. */
  events_removed: number;
  deadlines: number;
  by_type: Record<string, number>;
  /** Lines imported as "note" for lack of a recognized type. */
  untyped: { folder: string; line: number; excerpt: string }[];
  /** Checked or journal lines without a date: not imported. */
  without_date: { folder: string; line: number; excerpt: string }[];
}

export interface LineJournal {
  number: number;
  at: string;
  text: string;
}

const excerpt = (s: string) => {
  const t = withoutMarkdown(s);
  return t.length > 140 ? `${t.slice(0, 137)}…` : t;
};

const two = (n: number | string) => String(n).padStart(2, '0');

/** First date of the text: DD/MM/YYYY, otherwise DD/MM (year from the context). */
function dateOfText(text: string, yearByDefault: number): string | null {
  const complete = text.match(/(?<![\d/])(\d{1,2})\/(\d{1,2})\/(\d{4})(?![\d/])/);
  if (complete) return `${complete[3]}-${two(complete[2])}-${two(complete[1])}`;
  const short = text.match(/(?<![\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/);
  if (short && Number(short[2]) <= 12 && Number(short[1]) <= 31) return `${yearByDefault}-${two(short[2])}-${two(short[1])}`;
  return null;
}

/**
 * Dated lines of the "Suivi" section(s) of a folder: Date | Événement tables, bullets
 * "- 13/10/2026 — …" and checked boxes "- [x] Candidature envoyée le : 13/10/2026 (…)". Unchecked
 * boxes (to do) and code blocks are ignored.
 */
export function linesOfTracker(text: string, yearByDefault = new Date().getFullYear()): { lines: LineJournal[]; withoutDate: { number: number; text: string }[]; section: boolean } {
  const lines = text.split(/\r?\n/);
  const r: LineJournal[] = [];
  const withoutDate: { number: number; text: string }[] = [];
  let inTracker = false;
  let section = false;
  let code = false;
  let headers: string[] | null = null;
  let year = yearByDefault;
  const keep = (number: number, at: string | null, t: string) => {
    const clean = t.trim();
    if (!clean) return;
    if (!at) {
      withoutDate.push({ number, text: clean });
      return;
    }
    year = Number(at.slice(0, 4));
    r.push({ number, at, text: clean });
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(```|~~~)/.test(l)) {
      code = !code;
      continue;
    }
    if (code) continue;
    const title = l.match(/^(#{1,6})\s+(.*)$/);
    if (title) {
      inTracker = /\bsuivi\b/i.test(title[2]) && title[1].length >= 2;
      if (inTracker) section = true;
      headers = null;
      continue;
    }
    if (!inTracker) continue;
    const t = l.trim();
    if (t.startsWith('|')) {
      const c = cells(t);
      if (c.every((x) => /^:?-{2,}:?$/.test(x))) continue;
      if (!headers) {
        headers = c.map((x) => x.toLowerCase());
        continue;
      }
      const iDate = headers.findIndex((e) => e.startsWith('date'));
      const iText = headers.findIndex((e) => /^(événement|evenement|action|quoi)/.test(e));
      if (iDate < 0) continue;
      const textLine = iText >= 0 ? c[iText] : c.filter((_, k) => k !== iDate).join(' — ');
      keep(i + 1, dateOfText(c[iDate] ?? '', year), textLine ?? '');
      continue;
    }
    headers = null;
    const bullet = t.match(/^[-*+]\s+(?:\[([ xX])\]\s+)?(.*)$/);
    if (!bullet) continue;
    if (bullet[1] === ' ') continue; // unchecked box: to do, not an event
    const content = bullet[2];
    // "13/10/2026 — text": the leading date is removed from the text.
    const head = content.match(/^\**(\d{1,2}\/\d{1,2}(?:\/\d{4})?)\**\s*(?:—|–|-|:)\s*(.*)$/);
    if (head) keep(i + 1, dateOfText(head[1], year), head[2]);
    else keep(i + 1, dateOfText(content, year), content);
  }
  return { lines: r, withoutDate, section };
}

/** Type and direction guessed for a journal line (best effort; "note" otherwise). */
export function guessType(text: string): { type: TypeEvent; direction: Direction | null; recognized: boolean } {
  const t = withoutMarkdown(text).toLowerCase();
  // Direction: the first clue that appears ("Brief reçu par e-mail … réponse envoyée" → received).
  const withoutNegation = t.replace(/\b(non|pas|jamais) envoy\w*|avant (l')?envoi/g, ' ');
  const iSent = withoutNegation.search(/\b(envoy|relanc)/);
  const iReceived = withoutNegation.search(/reçue?\b|\bentrant|\be-?mail de\b|\bmessage de\b|\bréponse (client|de (?!\d)|du (?!\d)|d')|\bretour de\b/);
  const direction: Direction | null =
    iSent < 0 && iReceived < 0 ? null : iReceived < 0 ? 'sent' : iSent < 0 ? 'received' : iSent < iReceived ? 'sent' : 'received';
  const type = ((): TypeEvent | null => {
    if (/^(message entrant|e-?mail de|mail de|message de)\b/.test(t)) return 'message';
    if ((/^(proposition|devis)\b/.test(t) || /\b(proposition|devis) (envoy|reçu|transmi)/.test(t)) && !/proposition d'offre/.test(t)) {
      return 'proposal';
    }
    if (/(^|[^\p{L}])(refus|non retenu|clos|clôtur|abandonn|mise? de côté|mise en pause|perdue|go(?!\p{L}))/u.test(t)) return 'decision';
    if (/\b(test technique|case study|exercice|questionnaire technique)\b/.test(t)) return 'test';
    if (/^(appel|entretien|visio|rendez-vous|rdv)\b|\b(appel|entretien|visio) (à \d|avec\b|le \d)/.test(t)) return 'interview';
    if (direction) return 'message';
    return null;
  })();
  if (!type) return { type: 'note', direction: null, recognized: false };
  if (type === 'message' && /^(message entrant|e-?mail de|mail de|message de)\b/.test(t)) return { type, direction: 'received', recognized: true };
  return { type, direction: ['message', 'proposal', 'test'].includes(type) ? direction : null, recognized: true };
}

/** Amount ("3 000 € HT", "450 €/j") and days ("6 jours") of a proposal. */
function amountAndDays(text: string): Pick<EventInput, 'amount' | 'unit' | 'days'> {
  const t = withoutMarkdown(text).replace(/ | /g, ' ');
  const m = t.match(/(\d{1,3}(?:[ .]\d{3})+|\d+(?:,\d+)?)\s*(€\s*HT|€\s*\/\s*j|K€\s*\/\s*an|K€|€)/i);
  const j = t.match(/(\d+(?:,\d+)?)\s*(?:jours|j)\b(?!\s*cumul)/i);
  return {
    amount: m ? Number(m[1].replace(/[ .]/g, '').replace(',', '.')) : null,
    unit: m ? m[2].replace(/\s+/g, ' ').replace(/€ \/ j/, '€/j').replace(/K€ \/ an/i, 'K€/an') : null,
    days: j ? Number(j[1].replace(',', '.')) : null,
  };
}

/** Relative Markdown links and paths between backticks that designate an existing file. */
function filesCited(text: string, dataDir: string, folderRel: string): string[] {
  const found = new Set<string>();
  const attempt = (raw: string, base: string) => {
    const p = raw.trim().replace(/^<|>$/g, '').split('#')[0];
    if (!p || /^[a-z]+:/i.test(p) || p.startsWith('/')) return;
    let decode = p;
    try {
      decode = decodeURIComponent(p);
    } catch {
      /* lien mal encodé : tel quel */
    }
    const rel = posix.normalize(posix.join(base, decode));
    if (rel.startsWith('..') || rel.split('/').some((s) => s.startsWith('.'))) return;
    const abs = join(dataDir, ...rel.split('/'));
    if (existsSync(abs) && statSync(abs).isFile()) found.add(rel);
  };
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) attempt(m[1], folderRel);
  for (const m of text.matchAll(/`([^`\s]+\.[a-z0-9]{2,5})`/gi)) {
    attempt(m[1], folderRel);
    attempt(m[1], '');
  }
  return [...found];
}

/** Short summary: first sentence (or 200 characters) of the text without Markdown. */
function summaryOf(text: string): string {
  const t = withoutMarkdown(text).replace(/\s*\(\s*\)/g, '');
  const phrase = t.match(/^(.{20,200}?[.!?])(\s|$)/)?.[1] ?? t;
  return phrase.length > 200 ? `${phrase.slice(0, 197)}…` : phrase;
}

const words = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length >= 3);

/**
 * Folderless application whose company words (3 letters or more) all appear in the folder
 * name ("Hippocrate Care" → hippocrate-care-cto-cofondateur), if it is unique.
 */
function applicationOfName(db: Database, name: string): number | null {
  const wordsFolder = new Set(words(name));
  const candidates = (
    db
      .prepare('SELECT c.offer_id, o.company FROM applications c JOIN offers o ON o.id = c.offer_id WHERE c.folder IS NULL')
      .all() as { offer_id: number; company: string | null }[]
  ).filter((c) => {
    const m = words(c.company ?? '');
    return m.length > 0 && m.every((x) => wordsFolder.has(x));
  });
  return candidates.length === 1 ? candidates[0].offer_id : null;
}

/** Imports the journals of the active application folders. */
export function importJournals(db: Database, dataDir: string): ReportJournal {
  const report: ReportJournal = {
    folders: 0,
    folders_without_offer: [],
    folders_attached: [],
    folders_without_tracker: [],
    lines: 0,
    events_created: 0,
    events_existing: 0,
    events_duplicate: [],
    events_removed: 0,
    deadlines: 0,
    by_type: {},
    untyped: [],
    without_date: [],
  };
  const root = join(dataDir, 'candidatures');
  if (!existsSync(root)) return report;
  const names = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort();
  const offerOf = db.prepare('SELECT offer_id FROM applications WHERE folder = ? OR folder = ?');
  const existing = db.prepare("SELECT id, import_key, updated_at FROM events WHERE offer_id = ? AND origin = 'import' AND import_key LIKE 'tracker:%'");
  // An event entered by hand (CLI, MCP, dashboard) is not duplicated by the import of the same fact written in the folder.
  const recordedByHand = db.prepare(
    "SELECT 1 FROM events WHERE offer_id = ? AND type = ? AND origin <> 'import' AND substr(at, 1, 10) = ? AND (direction IS NULL OR ? IS NULL OR direction = ?) LIMIT 1",
  );
  transaction(db, () => {
    for (const name of names) {
      const sheet = join(root, name, 'dossier-candidature.md');
      if (!existsSync(sheet)) continue;
      report.folders++;
      const folderRel = `candidatures/${name}`;
      let link = offerOf.get(folderRel, `${folderRel}/`) as { offer_id: number } | undefined;
      if (!link) {
        const offerId = applicationOfName(db, name);
        if (offerId === null) {
          report.folders_without_offer.push(folderRel);
          continue;
        }
        saveApplication(db, offerId, { folder: folderRel }, { origin: 'import-tracker' });
        report.folders_attached.push({ folder: folderRel, offer_id: offerId });
        link = { offer_id: offerId };
      }
      const text = readFileSync(sheet, 'utf8');
      const { lines, withoutDate, section } = linesOfTracker(text);
      if (!section || (!lines.length && !withoutDate.length)) report.folders_without_tracker.push(folderRel);
      for (const s of withoutDate) report.without_date.push({ folder: folderRel, line: s.number, excerpt: excerpt(s.text) });
      const keys = new Set<string>();
      const already = new Map(
        (existing.all(link.offer_id) as { id: number; import_key: string; updated_at: string | null }[]).map((e) => [e.import_key, e]),
      );
      for (const l of lines) {
        report.lines++;
        const key = `tracker:${fingerprint(`${l.at}|${l.text}`)}`;
        if (keys.has(key)) continue;
        keys.add(key);
        const guessed = guessType(l.text);
        report.by_type[guessed.type] = (report.by_type[guessed.type] ?? 0) + 1;
        if (!guessed.recognized) report.untyped.push({ folder: folderRel, line: l.number, excerpt: excerpt(l.text) });
        if (already.has(key)) {
          report.events_existing++;
          continue;
        }
        const direction = guessed.direction ?? null;
        if (recordedByHand.get(link.offer_id, guessed.type, l.at.slice(0, 10), direction, direction)) {
          report.events_duplicate.push({ folder: folderRel, line: l.number, excerpt: excerpt(l.text) });
          continue;
        }
        const summary = summaryOf(l.text);
        const details = withoutMarkdown(l.text) === summary ? null : l.text;
        const e = addEvent(
          db,
          link.offer_id,
          {
            type: guessed.type,
            direction: guessed.direction,
            at: l.at,
            summary,
            details,
            files: filesCited(l.text, dataDir, folderRel),
            ...(guessed.type === 'proposal' ? amountAndDays(l.text) : {}),
          },
          'import',
          { importKey: key },
        );
        report.events_created++;
        if (!e.done) report.deadlines++;
      }
      // Line gone or rewritten in the folder: the imported event (never modified since) is removed.
      for (const [key, e] of already) {
        if (!keys.has(key) && !e.updated_at) {
          db.prepare('DELETE FROM events WHERE id = ?').run(e.id);
          report.events_removed++;
        }
      }
    }
  });
  return report;
}
