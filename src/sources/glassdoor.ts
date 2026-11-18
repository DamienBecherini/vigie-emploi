// Glassdoor. The application never downloads its pages, and the site blocks a browser driven by a program: the
// user reads the job ad and gives its text to the AI.
import { type FieldsEmail, hostOf, type SourceAdapter } from './adapter.ts';

/** A country site of Glassdoor: www.glassdoor.fr, www.glassdoor.com, www.glassdoor.co.uk, fr.glassdoor.be… */
const COUNTRY_SITE = /^(?:www|[a-z]{2})\.glassdoor\.(?:com|[a-z]{2}|com?\.[a-z]{2})$/;

/** Gender mentions that end the job title (the location follows). */
const KIND = /^(.*?(?:\(?\b(?:H\s*\/\s*F|F\s*\/\s*H)(?:\s*\/\s*[NX])?\)?|\((?:m\s*\/\s*w\s*\/\s*d|w\s*\/\s*m\s*\/\s*d|f\s*\/\s*m\s*\/\s*d)\)))\s+(.+)$/i;

/**
 * Glassdoor puts in the link: "Entreprise 4.0 ★ Intitulé (H/F) Lieu 50 k € - 65 k € (Estimation de l'employeur) 17h
 * Candidature facile". What can be split without risk is split; the rest stays in the job title.
 */
export function splitGlassdoor(raw: string): FieldsEmail {
  let t = raw.replace(/\s+/g, ' ').trim();
  t = t.replace(/\s+Candidature\b.*$/i, '').trim();
  t = t.replace(/\s+\d{1,2}\s*(?:h|j|d)\+?$/i, '').trim();
  const r: FieldsEmail = { title: t };
  const salary = t.match(/\s+(\d[\d\s.,]*\s*k?\s*€(?:\s*-\s*\d[\d\s.,]*\s*k?\s*€)?)(?:\s*\(Estimation[^)]*\)?)?$/i);
  if (salary && salary.index !== undefined) {
    r.compensation = salary[1].replace(/\s+/g, ' ').trim();
    t = t.slice(0, salary.index).trim();
  }
  const score = t.match(/^(.+?)\s+\d[.,]\d\s*★\s+(.+)$/);
  if (score) {
    r.company = score[1].trim();
    t = score[2].trim();
  }
  const kind = t.match(KIND);
  if (kind && kind[2].length <= 40) {
    t = kind[1].trim();
    r.location = kind[2].trim();
  }
  r.title = t;
  return r;
}

export const glassdoor: SourceAdapter = {
  id: 'glassdoor',
  browserReading: 'human',
  // The job ad is the `jobListingId` or `jl` parameter. The address keeps the country site of the link; a link
  // that names none gets the French site, as before the country sites were kept.
  identify(url) {
    if (!/glassdoor\./.test(url)) return null;
    const m = url.match(/(?:jobListingId|[?&]jl)=(\d+)/);
    if (!m) return null;
    const host = hostOf(url);
    return { siteId: m[1], url: `https://${host && COUNTRY_SITE.test(host) ? host : 'www.glassdoor.fr'}/job-listing/?jl=${m[1]}` };
  },
  splitLinkText: splitGlassdoor,
};
