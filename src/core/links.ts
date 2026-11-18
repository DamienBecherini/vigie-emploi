// Decoding of the tracking links of alert e-mails and identification of the job ads they point to.
// What each job site looks like is in src/sources/ (one adapter per site).
import { gunzipSync } from 'node:zlib';
import { identifyOffer, type OfferIdentified } from '../sources/index.ts';

export { decodeHTML, textHtml, textHtmlLines } from './html.ts';
export type { OfferIdentified };

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
      /* the link as it is */
    }
  }
  return href;
}

/** Source, id on the site and canonical URL of an offer, or null if the link is not one. */
export function canonicalize(url: string): OfferIdentified | null {
  return identifyOffer(url);
}

/** Identifies an offer from an e-mail link (direct or tracking). */
export function identifierLink(href: string): OfferIdentified | null {
  return canonicalize(href) ?? canonicalize(decodeLink(href));
}
