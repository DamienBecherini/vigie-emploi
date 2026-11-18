// Registry of the job sites the application knows. Nothing else in the code names a site.
//
// Adding a site: write its adapter in this folder (see adapter.ts for what each field means, hellowork.ts for
// a short example), add it to ADAPTERS below, and give it a block in tests/sources.test.ts. Define `extract` only
// if the terms of use of the site let a program download its pages.
import type { OfferIdentified, SourceAdapter } from './adapter.ts';
import { collective } from './collective.ts';
import { freeWork } from './free-work.ts';
import { glassdoor } from './glassdoor.ts';
import { hellowork } from './hellowork.ts';
import { indeed } from './indeed.ts';
import { linkedin } from './linkedin.ts';

export type { DetailPage, FieldsEmail, OfferIdentified, SourceAdapter } from './adapter.ts';

/** The adapters, in the order a link is tried against them. */
export const ADAPTERS: readonly SourceAdapter[] = [linkedin, indeed, glassdoor, hellowork, freeWork, collective];

/** Adapter of a site; undefined for a job ad that comes from none of them (added by hand, old import). */
export function adapterOf(source: string): SourceAdapter | undefined {
  return ADAPTERS.find((a) => a.id === source);
}

/** Site, identifier on the site and address of the job ad a link points to; null if the link is not a job ad. */
export function identifyOffer(url: string): OfferIdentified | null {
  for (const adapter of ADAPTERS) {
    const found = adapter.identify(url);
    if (found) return { source: adapter.id, ...found };
  }
  return null;
}
