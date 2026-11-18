// Hellowork (French site). Its public pages carry a JobPosting in JSON-LD, which the application reads.
import type { SourceAdapter } from './adapter.ts';
import { readJobPosting } from './job-posting.ts';

export const hellowork: SourceAdapter = {
  id: 'hellowork',
  browserReading: 'agent',
  identify(url) {
    const m = url.match(/hellowork\.com\/fr-fr\/emplois\/(\d+)\.html/);
    return m ? { siteId: m[1], url: `https://www.hellowork.com/fr-fr/emplois/${m[1]}.html` } : null;
  },
  extract(page) {
    const d = readJobPosting(page);
    // The description ends with the presentation of the company, already known: it is cut.
    if (d?.description) d.description = d.description.split(/\n?\s*Bienvenue chez /)[0].trim() || null;
    return d;
  },
};
