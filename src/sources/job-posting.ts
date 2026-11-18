// Reading of the schema.org JobPosting (JSON-LD) that many job sites put in their public pages.
// Shared by the adapters of the sites whose pages the application may download.
import { textHtmlLines } from '../core/html.ts';
import { dateIso } from '../core/text.ts';
import { type KeyServer, t } from '../i18n/index.ts';
import type { DetailPage } from './adapter.ts';

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

/** Contract kinds of schema.org (employmentType), named in the language of the workspace. */
const CONTRACTS: Record<string, KeyServer> = {
  FULL_TIME: 'core.contract.fullTime',
  PART_TIME: 'core.contract.partTime',
  CONTRACTOR: 'core.contract.contractor',
  TEMPORARY: 'core.contract.temporary',
  INTERN: 'core.contract.intern',
  PERMANENT: 'core.contract.permanent',
};

/** Job ad of an HTML page that contains a JobPosting in JSON-LD; null when there is none. */
export function readJobPosting(page: string): DetailPage | null {
  for (const m of page.matchAll(/<script[^>]*ld(?:\+|&#x2B;)json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let d: unknown;
    try {
      d = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const jp = findJobPosting(d);
    if (!jp) continue;
    const description = textHtmlLines(String(jp.description ?? ''));
    const locationRaw = jp.jobLocation as Json | Json[] | undefined;
    const location = (Array.isArray(locationRaw) ? locationRaw[0] : locationRaw) ?? {};
    const address = ((location as Json).address ?? {}) as Json;
    const salary = ((jp.baseSalary as Json | undefined)?.value ?? {}) as Json;
    const amounts = ['minValue', 'maxValue', 'value'].filter((k) => k in salary).map((k) => String(salary[k]));
    const compensation = amounts.length ? `${amounts.join('-')} ${String(salary.unitText ?? '')}`.trim() : null;
    const types = ([] as unknown[]).concat(jp.employmentType ?? []).map((type) => (CONTRACTS[String(type)] ? t(CONTRACTS[String(type)]) : String(type)));
    return {
      title: jp.title ? String(jp.title) : null,
      company: ((jp.hiringOrganization as Json | undefined)?.name as string | undefined) ?? null,
      location: (address.addressLocality as string | undefined) ?? null,
      contract: types.length ? types.join(', ') : null,
      compensation,
      remote: jp.jobLocationType === 'TELECOMMUTE' ? t('core.remote.yes') : null,
      published_at: dateIso((jp.datePosted as string | undefined) ?? null),
      description: description || null,
    };
  }
  return null;
}
