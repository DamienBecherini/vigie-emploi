// Reading of the cells of the history's Markdown tables (_ecartees.md, _SUIVI.md): pure functions, no database.
// The column of a line, the scores and conditions of a cell, and the offers of a line of the register of dismissed offers.
import { canonicalize } from '../core/links.ts';
import type { FieldsOffer } from '../core/offers.ts';
import { fingerprint, withoutMarkdown, findCompensation } from '../core/text.ts';
import { split, linksMarkdown, type LineTable } from './markdown.ts';

/** Start of a line, to quote in a report. */
export const excerpt = (s: string) => (s.length > 160 ? `${s.slice(0, 157)}…` : s);

/** Cell of a line by column name (start of the label, case and accents ignored). */
export function column(l: LineTable, ...names: string[]): string | undefined {
  const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
  for (const name of names) {
    const i = l.headers.findIndex((e) => norm(e).startsWith(norm(name)));
    if (i >= 0) return l.cells[i];
  }
  return undefined;
}

/** Scores of a cell "6/10", "6 et 5,5/10", "7 · 6,5 · 4"; empty if ambiguous ("4 à 7/10", "≤ 2,5"). */
export function cellScores(cell: string): number[] {
  if (/[≤≥<>~≈]|(^|\s)à(\s|$)/.test(cell)) return [];
  return (cell.replace(/\/\s*10/g, '').match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(',', '.'))).filter((n) => n >= 0 && n <= 10);
}

/** Contract, compensation and remote work read in a "Conditions" or "Type" cell. */
export function readConditions(text: string): Pick<FieldsOffer, 'contract' | 'compensation' | 'remote'> {
  const t = withoutMarkdown(text);
  const contract = t.match(/\b(CDI|CDD|freelance|indépendant|portage|stage|alternance|intérim)\b/i)?.[1] ?? null;
  const tt = t.match(/(full remote|100 % (?:télétravail|remote)|full télétravail|full TT|télétravail[^,;·]*|remote[^,;·]*|hybride[^,;·]*)/i)?.[1] ?? null;
  return {
    contract: contract ? contract.charAt(0).toUpperCase() + contract.slice(1) : null,
    compensation: findCompensation(t),
    remote: tt ? tt.trim() : null,
  };
}

/** Removes from the cell the parentheses that only contain links "([offre](…), [doublon](…))". */
export function withoutLinkList(s: string): string {
  return s.replace(/\s*\(\s*(?:\[[^\]]*\]\([^)\s]*\)\s*,?\s*)+\)/g, '').replace(/\[[^\]]*\]\([^)\s]*\)/g, '');
}

export interface OfferRegister {
  source: string;
  siteId: string;
  url: string | null;
  title: string;
  company: string;
  conditions: string;
  score: number | null;
}

/**
 * Companies of a grouped cell of the register: separated by "·" or "/", otherwise one per bold block
 * ("**A** (filiale), **B**"). `parts`: one entry per company; `byOffer`: "(×3)" counts three times.
 */
export function cellCompanies(cell: string): { parts: string[]; byOffer: string[] } {
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

export function registerLineOffers(l: LineTable): { offers: OfferRegister[]; linksIgnored: string[] } {
  const company = column(l, 'entreprise') ?? '';
  const machine = column(l, 'poste') ?? '';
  const conditions = column(l, 'conditions') ?? '';
  const scores = cellScores(column(l, 'note') ?? '');
  const segments = split(machine, ' · ');
  const isBatch = /^lot\b/i.test(withoutMarkdown(company));
  const { parts: companies, byOffer } = cellCompanies(company);
  // Otherwise, one company per offer link (in order) when the numbers match; failing that, the whole cell.
  const linksJob = new Set(
    segments.flatMap((seg) =>
      linksMarkdown(seg)
        .map((x) => keyLink(x.url))
        .filter((x) => x !== null),
    ),
  );
  const bySegment = companies.length === segments.length;
  const byLink = !isBatch && !bySegment && byOffer.length > 1 && byOffer.length === linksJob.size;
  let rank = 0;
  const conds = split(conditions, ' · ');
  const offers: OfferRegister[] = [];
  const linksIgnored: string[] = [];
  const seen = new Set<string>();

  segments.forEach((seg, k) => {
    const text = withoutMarkdown(withoutLinkList(seg));
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
  // Links placed in the other columns (company, conditions).
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
      title: withoutMarkdown(withoutLinkList(machine)),
      company: withoutMarkdown(withoutLinkList(company)),
      conditions,
      score: scores.length === 1 ? scores[0] : null,
    });
  }
  if (!offers.length) {
    // Line without an offer link: a "register" offer identified by its content, to keep the history.
    const date = column(l, 'date') ?? '';
    offers.push({
      source: 'register',
      siteId: `reg-${fingerprint(`${date}|${withoutMarkdown(company)}|${withoutMarkdown(machine)}`)}`,
      url: null,
      title: withoutMarkdown(withoutLinkList(machine)) || withoutMarkdown(company),
      company: withoutMarkdown(withoutLinkList(company)),
      conditions,
      score: scores.length === 1 ? scores[0] : null,
    });
  }
  return { offers, linksIgnored };
}
