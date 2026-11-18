// LinkedIn. The application never downloads its pages (terms of use, anti-bot protections): the AI reads
// the job ad in the user's browser.
import type { SourceAdapter } from './adapter.ts';

export const linkedin: SourceAdapter = {
  id: 'linkedin',
  browserReading: 'agent',
  // /jobs/view/<id>/ or /comm/jobs/view/<title>-<id>/ (links of the alert e-mails).
  identify(url) {
    const m = url.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(?:[^/?#]*-)?(\d{6,})/);
    return m ? { siteId: m[1], url: `https://www.linkedin.com/jobs/view/${m[1]}/` } : null;
  },
};
