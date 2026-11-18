// Free-Work (French site of IT freelance missions and jobs). Its public pages carry a JobPosting in JSON-LD,
// which the application reads.
import type { SourceAdapter } from './adapter.ts';
import { readJobPosting } from './job-posting.ts';

// A job ad sits under /fr/tech-it/<category>/job-mission/<slug> or /fr/tech-it/job-mission/<category>/<slug>.
const LINKS = [
  /(https:\/\/www\.free-work\.com\/fr\/tech-it\/[^/?#\s]+\/job-mission\/[^?#\s)]+)/,
  /(https:\/\/www\.free-work\.com\/fr\/tech-it\/job-mission\/[^?#\s)]+)/,
];

export const freeWork: SourceAdapter = {
  id: 'free-work',
  browserReading: 'agent',
  identify(url) {
    for (const link of LINKS) {
      const m = url.match(link);
      if (!m) continue;
      const clean = m[1].replace(/\/+$/, '');
      return { siteId: clean.slice(clean.lastIndexOf('/') + 1), url: clean };
    }
    return null;
  },
  extract: readJobPosting,
};
