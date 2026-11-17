// Reading of the JobPosting JSON-LD of the public pages (Hellowork, Free-Work) and of the Collective page data.
// The application never downloads LinkedIn, Indeed nor Glassdoor (terms of use, anti-bot protections).
import { textHtmlLines } from '../core/links.ts';
import { dateIso } from '../core/text.ts';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export interface DetailJsonLd {
  title: string | null;
  company: string | null;
  location: string | null;
  contract: string | null;
  compensation: string | null;
  remote: string | null;
  published_at: string | null;
  description: string | null;
}

export type Downloader = (url: string) => Promise<string>;

export const downloadPage: Downloader = async (url) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
};

type Json = Record<string, unknown>;

function findJobPosting(d: unknown): Json | null {
  if (!d || typeof d !== 'object') return null;
  if (Array.isArray(d)) {
    for (const x of d) {
      const r = findJobPosting(x);
      if (r) return r;
    }
    return null;
  }
  const o = d as Json;
  const type = o['@type'];
  if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) return o;
  if (o['@graph']) return findJobPosting(o['@graph']);
  return null;
}

const CONTRACTS: Record<string, string> = {
  FULL_TIME: 'Temps plein',
  PART_TIME: 'Temps partiel',
  CONTRACTOR: 'Freelance',
  TEMPORARY: 'CDD / intérim',
  INTERN: 'Stage',
  PERMANENT: 'CDI',
};

const CONTRACTS_COLLECTIVE: Record<string, string> = { FREELANCE: 'Freelance', PERMANENT: 'CDI', FIXED_TERM: 'CDD', INTERNSHIP: 'Stage' };
const MODES_COLLECTIVE: Record<string, string> = { REMOTE: 'full remote', HYBRID: 'hybride', ON_SITE: 'sur site', ONSITE: 'sur site' };

/** Offer of a Collective page (Next.js: props.pageProps.project of the __NEXT_DATA__ script). */
export function extractCollective(page: string): DetailJsonLd | null {
  const m = page.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let p: Json | undefined;
  try {
    p = ((JSON.parse(m[1]) as Json).props as Json | undefined)?.pageProps as Json | undefined;
    p = p?.project as Json | undefined;
  } catch {
    return null;
  }
  if (!p?.name) return null;
  const text = (h: unknown) => (h ? textHtmlLines(String(h)) : '');
  const profile = text(p.profileWanted);
  const description = [text(p.description), profile && `Profil recherché\n${profile}`].filter(Boolean).join('\n\n');
  const salary =
    p.minSalary || p.maxSalary
      ? `${[p.minSalary, p.maxSalary].filter(Boolean).join('-')} ${String(p.salaryCurrency ?? '€')} ${String(p.salaryFrequency ?? '')}`.trim()
      : null;
  // Free budget ("500 - 524€", "650€/jour", "CDI 51-55K / Freelance : 500-520 TJM"): "/j" only if it has no unit.
  const raw = typeof p.budgetBrief === 'string' ? p.budgetBrief.trim() : '';
  const budget = raw ? (/jour|\/j\b|tjm|k€|k\b|an\b|mois|mensuel|annuel/i.test(raw) ? raw : `${raw}/j`) : null;
  const contracts = ((p.contractTypes as string[] | undefined) ?? []).map((c) => CONTRACTS_COLLECTIVE[c] ?? c);
  const modes = ((p.workPreferences as string[] | undefined) ?? []).map((w) => MODES_COLLECTIVE[w] ?? w.toLowerCase());
  return {
    title: String(p.name),
    company: ((p.company as Json | undefined)?.name as string | undefined) ?? null,
    location: ((p.location as Json | undefined)?.fullNameFrench as string | undefined) ?? null,
    contract: contracts.length ? contracts.join(', ') : null,
    compensation: salary ?? budget,
    remote: modes.length ? modes.join(', ') : null,
    published_at: dateIso((p.publishedAt as string | undefined) ?? null),
    description: description || null,
  };
}

/** Extracts the offer of an HTML page containing a JobPosting JSON-LD (or, failing that, Collective page data). */
export function extractJsonLd(page: string): DetailJsonLd | null {
  for (const m of page.matchAll(/<script[^>]*ld(?:\+|&#x2B;)json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let d: unknown;
    try {
      d = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const jp = findJobPosting(d);
    if (!jp) continue;
    let description = textHtmlLines(String(jp.description ?? ''));
    description = description.split(/\n?\s*Bienvenue chez /)[0].trim(); // Hellowork repeats the company presentation
    const locationRaw = jp.jobLocation as Json | Json[] | undefined;
    const location = (Array.isArray(locationRaw) ? locationRaw[0] : locationRaw) ?? {};
    const address = ((location as Json).address ?? {}) as Json;
    const salary = ((jp.baseSalary as Json | undefined)?.value ?? {}) as Json;
    const amounts = ['minValue', 'maxValue', 'value'].filter((k) => k in salary).map((k) => String(salary[k]));
    const compensation = amounts.length ? `${amounts.join('-')} ${String(salary.unitText ?? '')}`.trim() : null;
    const types = ([] as unknown[]).concat(jp.employmentType ?? []).map((t) => CONTRACTS[String(t)] ?? String(t));
    return {
      title: jp.title ? String(jp.title) : null,
      company: ((jp.hiringOrganization as Json | undefined)?.name as string | undefined) ?? null,
      location: (address.addressLocality as string | undefined) ?? null,
      contract: types.length ? types.join(', ') : null,
      compensation,
      remote: jp.jobLocationType === 'TELECOMMUTE' ? 'oui' : null,
      published_at: dateIso((jp.datePosted as string | undefined) ?? null),
      description: description || null,
    };
  }
  return extractCollective(page);
}
