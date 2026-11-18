// Indeed. The application never downloads its pages (terms of use, anti-bot protections): the AI reads
// the job ad in the user's browser.
import { hostOf, type SourceAdapter } from './adapter.ts';

/** A country site of Indeed: www.indeed.com, fr.indeed.com, uk.indeed.com, emplois.ca.indeed.com… */
const COUNTRY_SITE = /^(?:[a-z]+\.)?(?:www|[a-z]{2})\.indeed\.com$/;

export const indeed: SourceAdapter = {
  id: 'indeed',
  browserReading: 'agent',
  // The job ad is the `jk` parameter. The address keeps the country site of the link; a link that names none
  // (a tracking host) gets the French site, as before the country sites were kept.
  identify(url) {
    if (!/indeed\./.test(url)) return null;
    const m = url.match(/[?&]jk=([0-9a-f]+)/i);
    if (!m) return null;
    const jk = m[1].toLowerCase();
    const host = hostOf(url);
    return { siteId: jk, url: `https://${host && COUNTRY_SITE.test(host) ? host : 'fr.indeed.com'}/viewjob?jk=${jk}` };
  },
};
