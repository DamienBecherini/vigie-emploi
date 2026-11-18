// Collective (collective.work, French freelance collectives). Its public pages are a Next.js application: the job
// ad is in the page data (props.pageProps.project of the __NEXT_DATA__ script), which the application reads.
import { textHtmlLines } from '../core/html.ts';
import { dateIso } from '../core/text.ts';
import { type KeyServer, t } from '../i18n/index.ts';
import type { DetailPage, SourceAdapter } from './adapter.ts';
import { readJobPosting } from './job-posting.ts';

type Json = Record<string, unknown>;

const CONTRACTS: Record<string, KeyServer> = {
  FREELANCE: 'core.contract.contractor',
  PERMANENT: 'core.contract.permanent',
  FIXED_TERM: 'core.contract.fixedTerm',
  INTERNSHIP: 'core.contract.intern',
};
const MODES: Record<string, KeyServer> = {
  REMOTE: 'core.remote.full',
  HYBRID: 'core.remote.hybrid',
  ON_SITE: 'core.remote.onsite',
  ONSITE: 'core.remote.onsite',
};

/** Job ad of a Collective page; null when the page data holds none. */
function readPageData(page: string): DetailPage | null {
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
  const description = [text(p.description), profile && `${t('core.ingest.profileWanted')}\n${profile}`].filter(Boolean).join('\n\n');
  const salary =
    p.minSalary || p.maxSalary
      ? `${[p.minSalary, p.maxSalary].filter(Boolean).join('-')} ${String(p.salaryCurrency ?? '€')} ${String(p.salaryFrequency ?? '')}`.trim()
      : null;
  // Free budget ("500 - 524€", "650€/jour", "CDI 51-55K / Freelance : 500-520 TJM"): "/j" only if it has no unit.
  const raw = typeof p.budgetBrief === 'string' ? p.budgetBrief.trim() : '';
  const budget = raw ? (/jour|\/j\b|tjm|k€|k\b|an\b|mois|mensuel|annuel/i.test(raw) ? raw : `${raw}/j`) : null;
  const contracts = ((p.contractTypes as string[] | undefined) ?? []).map((c) => (CONTRACTS[c] ? t(CONTRACTS[c]) : c));
  const modes = ((p.workPreferences as string[] | undefined) ?? []).map((w) => (MODES[w] ? t(MODES[w]) : w.toLowerCase()));
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

export const collective: SourceAdapter = {
  id: 'collective',
  browserReading: 'agent',
  // /jobs/<slug> or /jobs/<language>/<slug>; /company/<name>/jobs is the page of a company, not a job ad.
  identify(url) {
    const m = url.match(/collective\.work\/jobs\/(?:[a-z]{2}\/)?([a-z0-9][a-z0-9-]*[a-z0-9])/i);
    if (!m) return null;
    const slug = m[1].toLowerCase();
    return { siteId: slug, url: `https://www.collective.work/jobs/fr/${slug}` };
  },
  extract: (page) => readJobPosting(page) ?? readPageData(page),
  // The links of the e-mail say "Voir l'offre"; the job title is in its text ("Offre : … Postuler").
  titleInEmail: (text) => text.match(/Offre\s*:\s*(.+?)\s+Postuler\b/)?.[1].trim() ?? null,
};
