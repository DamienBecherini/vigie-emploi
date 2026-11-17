// Petites fonctions de normalisation : rémunération, dates, valeurs « NC ».

export interface Remuneration {
  min: number | null;
  max: number | null;
  /** 'an' (salaire annuel brut), 'mois', 'jour' (TJM) ou 'heure'. */
  unite: 'an' | 'mois' | 'jour' | 'heure' | null;
}

const VIDE: Remuneration = { min: null, max: null, unite: null };

/** Valeur absente : null, chaîne vide, « NC », « — », « - », « N/A ». */
export function estVide(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v !== 'string') return false;
  return /^\s*(nc|n\/c|n\.c\.|—|-|–|n\/a|non communiqué|inconnu)?\s*$/i.test(v);
}

export function nettoyer(v: unknown): string | null {
  if (estVide(v)) return null;
  return String(v).trim();
}

function nombre(s: string): number {
  return Number(s.replace(/[\s  ]/g, '').replace(',', '.'));
}

// Séparateurs de milliers : espace, point, virgule (« 52,000 », à l'anglaise). Une virgule suivie d'autre chose
// que des groupes de trois chiffres reste décimale (« 26,6 K€ »).
const NB = String.raw`\d{1,3}(?:[ .,]\d{3})+(?![.,]?\d)|\d+(?:[.,]\d+)?`;
const DEVISE = String.raw`(?:k\s*€|k\s*eur|€|eur\b|euros?\b|k\b)`;
const RE_FOURCHETTE = new RegExp(
  String.raw`(?:${NB})\s*(?:k\s*)?(?:€\s*)?(?:-|–|à|to)\s*(?:${NB})\s*${DEVISE}[^,;·(]*`,
  'i',
);
const RE_MONTANT = new RegExp(String.raw`(?:${NB})\s*${DEVISE}[^,;·(]*`, 'i');

/**
 * Isole la rémunération dans un texte libre (« CDI Paris, 100 % télétravail, 50-60 K€ » → « 50-60 K€ ») :
 * un montant ou une fourchette suivi d'une devise. Ignore « 100 % », « Paris 5e », « 3 j/sem »…
 */
export function trouverRemuneration(texte: string | null | undefined): string | null {
  if (!texte) return null;
  const t = texte.replace(/ | /g, ' ');
  const m = t.match(RE_FOURCHETTE) ?? t.match(RE_MONTANT);
  return m ? m[0].trim() : null;
}

/**
 * Lit une fourchette de rémunération libre : « 40-48 K€ », « 55 K€ », « 400 €/j », « 450 à 500 € / jour »,
 * « 3 000 € brut / mois », « 45000-55000 EUR YEAR » (JSON-LD). Retourne des montants en euros.
 */
export function lireRemuneration(texte: string | null | undefined): Remuneration {
  if (!texte || estVide(texte)) return VIDE;
  let t: string = texte.replace(/ | /g, ' ');
  const ancre = trouverRemuneration(t);
  if (ancre) t = ancre;
  else if (t.length > 40) return VIDE;
  const re = new RegExp(String.raw`(${NB})\s*(k)?`, 'gi');
  const valeurs: { v: number; k: boolean }[] = [];
  for (const m of t.matchAll(re)) {
    const brut = /^\d{1,3}(?:[.,]\d{3})+$/.test(m[1]) ? m[1].replace(/[.,]/g, '') : m[1];
    const v = nombre(brut);
    if (!Number.isFinite(v) || v === 0) continue;
    valeurs.push({ v, k: Boolean(m[2]) });
    if (valeurs.length === 2) break;
  }
  if (valeurs.length === 0) return VIDE;
  const kGlobal = /\d\s*k\s*(€|eur|euros)?/i.test(t) || /\bk€/i.test(t);
  const montants = valeurs.map(({ v, k }) => (k || (kGlobal && v < 1000) ? v * 1000 : v));
  let unite: Remuneration['unite'] = null;
  if (/(\/\s*j\b|\/\s*jour|par jour|tjm|\bday\b|journalier)/i.test(t)) unite = 'jour';
  else if (/(\/\s*h\b|\/\s*heure|\bhour\b|horaire)/i.test(t)) unite = 'heure';
  else if (/(\/\s*mois|par mois|mensuel|\bmonth\b)/i.test(t)) unite = 'mois';
  else if (/(\/\s*an\b|par an|annuel|\byear\b|k€|\bk\b|brut)/i.test(t) || montants[0] >= 10000) unite = 'an';
  else if (montants[0] >= 100 && montants[0] <= 2000) unite = 'jour';
  const [a, b] = montants;
  return { min: Math.min(a, b ?? a), max: Math.max(a, b ?? a), unite };
}

/** Date JJ/MM/AAAA (ou JJ/MM/AA, ou MM/AAAA) trouvée dans un texte, au format ISO. */
export function dateFr(texte: string | null | undefined): string | null {
  if (!texte) return null;
  let m = texte.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const annee = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${annee}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = texte.match(/(?<![\d/])(\d{1,2})\/(\d{4})/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  m = texte.match(/\b(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** Date ISO (AAAA-MM-JJ) d'une valeur Date ou d'une chaîne lisible par Date. */
export function dateIso(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function maintenant(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Retire la mise en forme Markdown d'une cellule (gras, liens, italique). */
export function sansMarkdown(texte: string): string {
  return texte
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Identifiant court et stable d'un texte (FNV-1a 32 bits, en hexadécimal). */
export function empreinte(texte: string): string {
  let h = 0x811c9dc5;
  for (const c of texte.normalize('NFC').toLowerCase()) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
