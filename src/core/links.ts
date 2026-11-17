// Decoding of the tracking links of alert e-mails and identification of the offers.
import { gunzipSync } from 'node:zlib';
import { decodeHTML } from 'entities';

export type Source = 'linkedin' | 'indeed' | 'glassdoor' | 'hellowork' | 'free-work' | 'collective';
export const SOURCES_KNOWN: Source[] = ['linkedin', 'indeed', 'glassdoor', 'hellowork', 'free-work', 'collective'];
/** Sources whose public page is read by the application (JSON-LD or page data). Never LinkedIn, Indeed nor Glassdoor. */
export const SOURCES_JSONLD: Source[] = ['hellowork', 'free-work', 'collective'];

export interface OfferIdentified {
  source: Source;
  siteId: string;
  url: string;
}

/**
 * Returns the destination URL of a tracking link (Mailjet, Hellowork in base64, Indeed in gzip),
 * or the link as it is. Each long enough path segment is tried as base64 (url-safe).
 */
export function decodeLink(href: string): string {
  for (const seg of href.split('/')) {
    if (seg.length < 20) continue;
    const b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
    let text: string;
    try {
      const raw = Buffer.from(b64, 'base64');
      if (raw.length === 0) continue;
      text = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw).toString('utf8') : raw.toString('utf8');
    } catch {
      continue;
    }
    // biome-ignore lint/suspicious/noControlCharactersInRegex: a decoded tracking link ends at the first control character
    const m = text.match(/https?:\/\/[^\s"\\\x00-\x1f]+/);
    if (m) return m[0];
  }
  // Destination passed as a parameter (?url=https%3A%2F%2F…)
  const m = href.match(/[?&](?:url|u|redirect|dest|target)=(https?%3A[^&]+)/i);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      /* lien tel quel */
    }
  }
  return href;
}

/** Source, id on the site and canonical URL of an offer, or null if the link is not one. */
export function canonicalize(url: string): OfferIdentified | null {
  let m: RegExpMatchArray | null;
  if ((m = url.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(?:[^/?#]*-)?(\d{6,})/))) {
    return { source: 'linkedin', siteId: m[1], url: `https://www.linkedin.com/jobs/view/${m[1]}/` };
  }
  if (/indeed\./.test(url) && (m = url.match(/[?&]jk=([0-9a-f]+)/i))) {
    const jk = m[1].toLowerCase();
    return { source: 'indeed', siteId: jk, url: `https://fr.indeed.com/viewjob?jk=${jk}` };
  }
  if (/glassdoor\./.test(url) && (m = url.match(/(?:jobListingId|[?&]jl)=(\d+)/))) {
    return { source: 'glassdoor', siteId: m[1], url: `https://www.glassdoor.fr/job-listing/?jl=${m[1]}` };
  }
  if ((m = url.match(/hellowork\.com\/fr-fr\/emplois\/(\d+)\.html/))) {
    return { source: 'hellowork', siteId: m[1], url: `https://www.hellowork.com/fr-fr/emplois/${m[1]}.html` };
  }
  if ((m = url.match(/(https:\/\/www\.free-work\.com\/fr\/tech-it\/[^/?#\s]+\/job-mission\/[^?#\s)]+)/))) {
    const clean = m[1].replace(/\/+$/, '');
    return { source: 'free-work', siteId: clean.slice(clean.lastIndexOf('/') + 1), url: clean };
  }
  if ((m = url.match(/(https:\/\/www\.free-work\.com\/fr\/tech-it\/job-mission\/[^?#\s)]+)/))) {
    const clean = m[1].replace(/\/+$/, '');
    return { source: 'free-work', siteId: clean.slice(clean.lastIndexOf('/') + 1), url: clean };
  }
  if ((m = url.match(/collective\.work\/jobs\/(?:[a-z]{2}\/)?([a-z0-9][a-z0-9-]*[a-z0-9])/i))) {
    const slug = m[1].toLowerCase();
    return { source: 'collective', siteId: slug, url: `https://www.collective.work/jobs/fr/${slug}` };
  }
  return null;
}

/** Identifies an offer from an e-mail link (direct or tracking). */
export function identifierLink(href: string): OfferIdentified | null {
  return canonicalize(href) ?? canonicalize(decodeLink(href));
}

/** Plain text of an HTML fragment (tags removed, entities decoded, spaces collapsed). */
export function textHtml(fragment: string): string {
  return decodeHTML(fragment.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Multi-line HTML text (paragraphs and lists kept), for descriptions. */
export function textHtmlLines(fragment: string): string {
  return decodeHTML(
    fragment
      .replace(/<\s*(br|\/p|\/li|\/h\d|\/div|\/ul|\/ol)\b[^>]*>/gi, '\n')
      .replace(/<\s*li\b[^>]*>/gi, '\n- ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export { decodeHTML };
