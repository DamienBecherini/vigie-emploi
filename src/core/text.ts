// Small normalization functions: compensation, dates, "NC" values.

export interface Compensation {
  min: number | null;
  max: number | null;
  /** 'year' (gross annual salary), 'month', 'day' (daily rate) or 'hour'. */
  unit: 'year' | 'month' | 'day' | 'hour' | null;
}

const EMPTY: Compensation = { min: null, max: null, unit: null };

/** Missing value: null, empty string, "NC", "—", "-", "N/A". */
export function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v !== 'string') return false;
  return /^\s*(nc|n\/c|n\.c\.|—|-|–|n\/a|non communiqué|inconnu)?\s*$/i.test(v);
}

export function sanitize(v: unknown): string | null {
  if (isEmpty(v)) return null;
  return String(v).trim();
}

function number(s: string): number {
  return Number(s.replace(/[\s  ]/g, '').replace(',', '.'));
}

// Thousands separators: space, dot, comma ("52,000", English style). A comma followed by anything other than
// groups of three digits stays a decimal comma ("26,6 K€").
const COUNT = String.raw`\d{1,3}(?:[ .,]\d{3})+(?![.,]?\d)|\d+(?:[.,]\d+)?`;
const CURRENCY = String.raw`(?:k\s*€|k\s*eur|€|eur\b|euros?\b|k\b)`;
const RE_RANGE = new RegExp(String.raw`(?:${COUNT})\s*(?:k\s*)?(?:€\s*)?(?:-|–|à|to)\s*(?:${COUNT})\s*${CURRENCY}[^,;·(]*`, 'i');
const RE_AMOUNT = new RegExp(String.raw`(?:${COUNT})\s*${CURRENCY}[^,;·(]*`, 'i');

/**
 * Isolates the compensation in a free text ("CDI Paris, 100 % télétravail, 50-60 K€" → "50-60 K€"):
 * an amount or a range followed by a currency. Ignores "100 %", "Paris 5e", "3 j/sem"…
 */
export function findCompensation(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.replace(/ | /g, ' ');
  const m = t.match(RE_RANGE) ?? t.match(RE_AMOUNT);
  return m ? m[0].trim() : null;
}

/**
 * Reads a free compensation range: "40-48 K€", "55 K€", "400 €/j", "450 à 500 € / jour",
 * "3 000 € brut / mois", "45000-55000 EUR YEAR" (JSON-LD). Returns amounts in euros.
 */
export function readCompensation(text: string | null | undefined): Compensation {
  if (!text || isEmpty(text)) return EMPTY;
  let t: string = text.replace(/ | /g, ' ');
  const anchor = findCompensation(t);
  if (anchor) t = anchor;
  else if (t.length > 40) return EMPTY;
  const re = new RegExp(String.raw`(${COUNT})\s*(k)?`, 'gi');
  const values: { v: number; k: boolean }[] = [];
  for (const m of t.matchAll(re)) {
    const raw = /^\d{1,3}(?:[.,]\d{3})+$/.test(m[1]) ? m[1].replace(/[.,]/g, '') : m[1];
    const v = number(raw);
    if (!Number.isFinite(v) || v === 0) continue;
    values.push({ v, k: Boolean(m[2]) });
    if (values.length === 2) break;
  }
  if (values.length === 0) return EMPTY;
  const kGlobal = /\d\s*k\s*(€|eur|euros)?/i.test(t) || /\bk€/i.test(t);
  const amounts = values.map(({ v, k }) => (k || (kGlobal && v < 1000) ? v * 1000 : v));
  let unit: Compensation['unit'] = null;
  if (/(\/\s*j\b|\/\s*jour|par jour|tjm|\bday\b|journalier)/i.test(t)) unit = 'day';
  else if (/(\/\s*h\b|\/\s*heure|\bhour\b|horaire)/i.test(t)) unit = 'hour';
  else if (/(\/\s*mois|par mois|mensuel|\bmonth\b)/i.test(t)) unit = 'month';
  else if (/(\/\s*an\b|par an|annuel|\byear\b|k€|\bk\b|brut)/i.test(t) || amounts[0] >= 10000) unit = 'year';
  else if (amounts[0] >= 100 && amounts[0] <= 2000) unit = 'day';
  const [a, b] = amounts;
  return { min: Math.min(a, b ?? a), max: Math.max(a, b ?? a), unit };
}

/** Date DD/MM/YYYY (or DD/MM/YY, or MM/YYYY) found in a text, in ISO format. */
export function dateFr(text: string | null | undefined): string | null {
  if (!text) return null;
  let m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = text.match(/(?<![\d/])(\d{1,2})\/(\d{4})/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  m = text.match(/\b(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** ISO date (YYYY-MM-DD) of a Date value or of a string readable by Date. */
export function dateIso(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function now(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Removes the Markdown formatting of a cell (bold, links, italics). */
export function withoutMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Short and stable identifier of a text (32-bit FNV-1a, in hexadecimal). */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (const c of text.normalize('NFC').toLowerCase()) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
