// Download of the public page of a job ad, for the sites whose adapter reads it (src/sources/).
// The application never downloads LinkedIn, Indeed nor Glassdoor (terms of use, anti-bot protections).

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export type Downloader = (url: string) => Promise<string>;

export const downloadPage: Downloader = async (url) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
};
