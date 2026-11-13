// Décodage des liens de suivi des e-mails d'alertes et identification des offres.
import { gunzipSync } from 'node:zlib';
import { decodeHTML } from 'entities';

export type Source = 'linkedin' | 'indeed' | 'glassdoor' | 'hellowork' | 'free-work' | 'collective';
export const SOURCES_KNOWN: Source[] = ['linkedin', 'indeed', 'glassdoor', 'hellowork', 'free-work', 'collective'];
/** Sources dont la page publique est lue par l'application (JSON-LD ou données de page). Jamais LinkedIn, Indeed ni Glassdoor. */
export const SOURCES_JSONLD: Source[] = ['hellowork', 'free-work', 'collective'];

export interface OfferIdentified {
  source: Source;
  siteId: string;
  url: string;
}

/**
 * Retourne l'URL de destination d'un lien de suivi (Mailjet, Hellowork en base64, Indeed en gzip),
 * ou le lien tel quel. Chaque segment de chemin assez long est essayé en base64 (url-safe).
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
    const m = text.match(/https?:\/\/[^\s"\\\x00-\x1f]+/);
    if (m) return m[0];
  }
  // Destination passée en paramètre (?url=https%3A%2F%2F…)
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

/** Source, identifiant sur le site et URL canonique d'une offre, ou null si le lien n'en est pas une. */
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

/** Identifie une offre à partir d'un lien d'e-mail (direct ou de suivi). */
export function identifierLink(href: string): OfferIdentified | null {
  return canonicalize(href) ?? canonicalize(decodeLink(href));
}

/** Texte brut d'un fragment HTML (balises retirées, entités décodées, espaces réduits). */
export function textHtml(fragment: string): string {
  return decodeHTML(fragment.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texte HTML multi-ligne (paragraphes et listes conservés), pour les descriptions. */
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
