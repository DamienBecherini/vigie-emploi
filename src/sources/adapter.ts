// What the application knows about a job site: how to recognise the link of one of its job ads, who reads the
// ad, and what its alert e-mails do differently. One adapter per site in this folder, listed in index.ts.

/** A job ad recognised in a link. */
export interface OfferIdentified {
  /** Identifier of the site (the id of its adapter), saved with the job ad. */
  source: string;
  /** Identifier of the job ad on the site. With the source, it is the key that tells two job ads apart. */
  siteId: string;
  /** Address of the job ad, without the tracking parameters. */
  url: string;
}

/** What the public page of a job ad says. */
export interface DetailPage {
  title: string | null;
  company: string | null;
  location: string | null;
  contract: string | null;
  compensation: string | null;
  remote: string | null;
  published_at: string | null;
  description: string | null;
}

/** Fields separated from the text of an e-mail link, when a site puts them all in a row. */
export interface FieldsEmail {
  title: string;
  company?: string;
  location?: string;
  compensation?: string;
}

export interface SourceAdapter {
  /** Identifier of the site, saved in the `source` column of a job ad: never change it once published. */
  readonly id: string;
  /**
   * Recognises the link of a job ad of the site: its identifier on the site and its address without tracking
   * parameters; null for any other link (search page, company page, another site).
   */
  identify(url: string): Omit<OfferIdentified, 'source'> | null;
  /**
   * Who opens the page in a browser when the application has no description: the AI ('agent'), or the user
   * ('human') on a site that blocks a browser driven by a program.
   */
  readonly browserReading: 'agent' | 'human';
  /**
   * Detail read in the public page of a job ad. Define it only for a site whose terms of use let a program
   * download its pages: the ingestion then downloads the page of each new job ad of the site.
   */
  extract?(page: string): DetailPage | null;
  /** Job title found in the text of an alert e-mail whose links do not carry it. */
  titleInEmail?(text: string): string | null;
  /** Splits the text of an e-mail link that holds the company, the job title, the location and the pay in a row. */
  splitLinkText?(text: string): FieldsEmail;
}

/** Host of the first address found in a text, in lower case; null without one. */
export function hostOf(url: string): string | null {
  return url.match(/https?:\/\/([^/?#\s]+)/i)?.[1].toLowerCase() ?? null;
}
