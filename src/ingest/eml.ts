// Reading of an alert e-mail (.eml): MIME, quoted-printable, base64, character sets (postal-mime).
import PostalMime from 'postal-mime';
import { identifierLink, textHtml, decodeHTML } from '../core/links.ts';
import { adapterOf } from '../sources/index.ts';
import { dateIso } from '../core/text.ts';

export interface OfferEmail {
  source: string;
  siteId: string;
  url: string;
  title: string;
  /** Subject of the e-mail the offer comes from. */
  subject: string;
  /** Date of the e-mail (YYYY-MM-DD). */
  receivedAt: string | null;
  /** Fields separated from the title when the site glues them together in the link (see SourceAdapter.splitLinkText). */
  company?: string;
  location?: string;
  compensation?: string;
}

export interface EmailRead {
  subject: string;
  date: string | null;
  offers: OfferEmail[];
  /** Acknowledgment of an application already sent (not an alert): its links are not new offers. */
  confirmation: boolean;
}

/** Subjects of application acknowledgments (LinkedIn, Free-Work, Indeed, Welcome to the Jungle, ATS…). */
export const SUBJECT_CONFIRMATION =
  /confirmation de (votre |ta )?candidature|(votre|ta) candidature (a (bien )?été|est) (envoyée|transmise|reçue|enregistrée)|candidature (bien )?(envoyée|reçue|transmise)|nous avons (bien )?reçu (votre|ta) candidature|merci pour (votre|ta) candidature|application (was |has been )?(sent|submitted|received)|thank you for (your )?appl/i;

/** Link texts that are not job titles. */
const LINKS_GENERIC =
  /^(voir l|voir plus|en savoir plus|postuler|candidater|ne correspond pas|afficher plus|voir toutes|offres? d.emploi similaires|emplois (de|chez|-)|chercher un autre|votre alerte|view job|apply|see all|see more|plus d.offres|modifier|se désabonner|désinscri)/i;

/** Extracts the offers of a .eml message (raw content). Duplicates inside the message are merged. */
export async function readEmail(content: Buffer | string): Promise<EmailRead> {
  const msg = await PostalMime.parse(content);
  const subject = msg.subject ?? '';
  const date = dateIso(msg.date ?? null);
  const offers = new Map<string, OfferEmail>();
  const keep = (href: string, titleRaw: string) => {
    const id = identifierLink(decodeHTML(href));
    if (!id) return;
    const title = titleRaw.trim();
    const key = `${id.source}:${id.siteId}`;
    let o = offers.get(key);
    if (!o) {
      o = { source: id.source, siteId: id.siteId, url: id.url, title: '', subject, receivedAt: date };
      offers.set(key, o);
    }
    if (title.length > o.title.length && !LINKS_GENERIC.test(title) && !/^https?:\/\//.test(title)) {
      o.title = title.slice(0, 140);
    }
  };
  if (msg.html) {
    for (const m of msg.html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      keep(m[1], textHtml(m[2]));
    }
  } else if (msg.text) {
    // Text version: "Job title" on the line before the URL, when there is one.
    const lines = msg.text.split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/https?:\/\/[^\s<>"]+/g)) {
        const before = (line.slice(0, m.index).trim() || (lines[i - 1] ?? '').trim()).replace(/\s*[:\-–<(]+$/, '');
        keep(m[0], before);
      }
    });
  }
  // What a site does differently in its e-mails is in its adapter: a job title that is in the text and not in
  // the link, fields in a row in the text of the link.
  const list = [...offers.values()];
  if (list.length === 1 && !list[0].title && msg.html) {
    const title = adapterOf(list[0].source)?.titleInEmail?.(textHtml(msg.html));
    if (title) list[0].title = title.slice(0, 140);
  }
  for (const o of list) {
    const split = adapterOf(o.source)?.splitLinkText;
    if (split && o.title) Object.assign(o, split(o.title));
  }
  return { subject, date, offers: list, confirmation: SUBJECT_CONFIRMATION.test(subject) };
}
