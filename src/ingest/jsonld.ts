// Lecture du JSON-LD JobPosting des pages publiques (Hellowork, Free-Work) et des données de page Collective.
// L'application ne télécharge jamais LinkedIn, Indeed ni Glassdoor (CGU, protections anti-robots).
import { texteHtmlLignes } from '../core/liens.ts';
import { dateIso } from '../core/texte.ts';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export interface DetailJsonLd {
  titre: string | null;
  entreprise: string | null;
  lieu: string | null;
  contrat: string | null;
  remuneration: string | null;
  teletravail: string | null;
  publiee_le: string | null;
  description: string | null;
}

export type Telechargeur = (url: string) => Promise<string>;

export const telechargerPage: Telechargeur = async (url) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
};

type Json = Record<string, unknown>;

function chercherJobPosting(d: unknown): Json | null {
  if (!d || typeof d !== 'object') return null;
  if (Array.isArray(d)) {
    for (const x of d) {
      const r = chercherJobPosting(x);
      if (r) return r;
    }
    return null;
  }
  const o = d as Json;
  const type = o['@type'];
  if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) return o;
  if (o['@graph']) return chercherJobPosting(o['@graph']);
  return null;
}

const CONTRATS: Record<string, string> = {
  FULL_TIME: 'Temps plein',
  PART_TIME: 'Temps partiel',
  CONTRACTOR: 'Freelance',
  TEMPORARY: 'CDD / intérim',
  INTERN: 'Stage',
  PERMANENT: 'CDI',
};

const CONTRATS_COLLECTIVE: Record<string, string> = { FREELANCE: 'Freelance', PERMANENT: 'CDI', FIXED_TERM: 'CDD', INTERNSHIP: 'Stage' };
const MODES_COLLECTIVE: Record<string, string> = { REMOTE: 'full remote', HYBRID: 'hybride', ON_SITE: 'sur site', ONSITE: 'sur site' };

/** Offre d'une page Collective (Next.js : props.pageProps.project du script __NEXT_DATA__). */
export function extraireCollective(page: string): DetailJsonLd | null {
  const m = page.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let p: Json | undefined;
  try {
    p = ((JSON.parse(m[1]) as Json).props as Json | undefined)?.pageProps as Json | undefined;
    p = p?.project as Json | undefined;
  } catch {
    return null;
  }
  if (!p || !p.name) return null;
  const texte = (h: unknown) => (h ? texteHtmlLignes(String(h)) : '');
  const profil = texte(p.profileWanted);
  const description = [texte(p.description), profil && `Profil recherché\n${profil}`].filter(Boolean).join('\n\n');
  const salaire =
    p.minSalary || p.maxSalary
      ? `${[p.minSalary, p.maxSalary].filter(Boolean).join('-')} ${String(p.salaryCurrency ?? '€')} ${String(p.salaryFrequency ?? '')}`.trim()
      : null;
  // Budget libre (« 500 - 524€ », « 650€/jour », « CDI 51-55K / Freelance : 500-520 TJM ») : « /j » seulement s'il n'a pas d'unité.
  const brut = typeof p.budgetBrief === 'string' ? p.budgetBrief.trim() : '';
  const budget = brut ? (/jour|\/j\b|tjm|k€|k\b|an\b|mois|mensuel|annuel/i.test(brut) ? brut : `${brut}/j`) : null;
  const contrats = ((p.contractTypes as string[] | undefined) ?? []).map((c) => CONTRATS_COLLECTIVE[c] ?? c);
  const modes = ((p.workPreferences as string[] | undefined) ?? []).map((w) => MODES_COLLECTIVE[w] ?? w.toLowerCase());
  return {
    titre: String(p.name),
    entreprise: ((p.company as Json | undefined)?.name as string | undefined) ?? null,
    lieu: ((p.location as Json | undefined)?.fullNameFrench as string | undefined) ?? null,
    contrat: contrats.length ? contrats.join(', ') : null,
    remuneration: salaire ?? budget,
    teletravail: modes.length ? modes.join(', ') : null,
    publiee_le: dateIso((p.publishedAt as string | undefined) ?? null),
    description: description || null,
  };
}

/** Extrait l'offre d'une page HTML contenant un JSON-LD JobPosting (ou, à défaut, des données de page Collective). */
export function extraireJsonLd(page: string): DetailJsonLd | null {
  for (const m of page.matchAll(/<script[^>]*ld(?:\+|&#x2B;)json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let d: unknown;
    try {
      d = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const jp = chercherJobPosting(d);
    if (!jp) continue;
    let description = texteHtmlLignes(String(jp.description ?? ''));
    description = description.split(/\n?\s*Bienvenue chez /)[0].trim(); // Hellowork répète la présentation de l'entreprise
    const lieuBrut = jp.jobLocation as Json | Json[] | undefined;
    const lieu = (Array.isArray(lieuBrut) ? lieuBrut[0] : lieuBrut) ?? {};
    const adresse = ((lieu as Json).address ?? {}) as Json;
    const salaire = ((jp.baseSalary as Json | undefined)?.value ?? {}) as Json;
    const montants = ['minValue', 'maxValue', 'value'].filter((k) => k in salaire).map((k) => String(salaire[k]));
    const remuneration = montants.length ? `${montants.join('-')} ${String(salaire.unitText ?? '')}`.trim() : null;
    const types = ([] as unknown[]).concat(jp.employmentType ?? []).map((t) => CONTRATS[String(t)] ?? String(t));
    return {
      titre: jp.title ? String(jp.title) : null,
      entreprise: ((jp.hiringOrganization as Json | undefined)?.name as string | undefined) ?? null,
      lieu: (adresse.addressLocality as string | undefined) ?? null,
      contrat: types.length ? types.join(', ') : null,
      remuneration,
      teletravail: jp.jobLocationType === 'TELECOMMUTE' ? 'oui' : null,
      publiee_le: dateIso((jp.datePosted as string | undefined) ?? null),
      description: description || null,
    };
  }
  return extraireCollective(page);
}
