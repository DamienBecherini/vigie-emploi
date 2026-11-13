// Lecture d'un e-mail d'alertes (.eml) : MIME, quoted-printable, base64, jeux de caractères (postal-mime).
import PostalMime from 'postal-mime';
import { identifierLink, textHtml, decodeHTML, type Source } from '../core/links.ts';
import { dateIso } from '../core/text.ts';

export interface OfferEmail {
  source: Source;
  siteId: string;
  url: string;
  title: string;
  /** Objet de l'e-mail d'où vient l'offre. */
  subject: string;
  /** Date de l'e-mail (AAAA-MM-JJ). */
  receivedAt: string | null;
  /** Champs séparés du titre quand l'e-mail les colle ensemble (Glassdoor). */
  company?: string;
  location?: string;
  compensation?: string;
}

export interface EmailRead {
  subject: string;
  date: string | null;
  offers: OfferEmail[];
  /** Accusé de réception d'une candidature déjà envoyée (pas une alerte) : ses liens ne sont pas de nouvelles offres. */
  confirmation: boolean;
}

/** Objets des accusés de réception de candidature (LinkedIn, Free-Work, Indeed, Welcome to the Jungle, ATS…). */
export const SUBJECT_CONFIRMATION =
  /confirmation de (votre |ta )?candidature|(votre|ta) candidature (a (bien )?été|est) (envoyée|transmise|reçue|enregistrée)|candidature (bien )?(envoyée|reçue|transmise)|nous avons (bien )?reçu (votre|ta) candidature|merci pour (votre|ta) candidature|application (was |has been )?(sent|submitted|received)|thank you for (your )?appl/i;

/** Textes de liens qui ne sont pas des intitulés d'offres. */
const LINKS_GENERIC =
  /^(voir l|voir plus|en savoir plus|postuler|candidater|ne correspond pas|afficher plus|voir toutes|offres? d.emploi similaires|emplois (de|chez|-)|chercher un autre|votre alerte|view job|apply|see all|see more|plus d.offres|modifier|se désabonner|désinscri)/i;

/** Extrait les offres d'un message .eml (contenu brut). Les doublons internes au message sont fusionnés. */
export async function readEmail(content: Buffer | string): Promise<EmailRead> {
  const msg = await PostalMime.parse(content);
  const subject = msg.subject ?? '';
  const date = dateIso(msg.date ?? null);
  const offers = new Map<string, OfferEmail>();
  const keep = (href: string, titleRaw: string) => {
    const id = identifierLink(decodeHTML(href));
    if (!id) return;
    const title = titleRaw.trim();
    let o = offers.get(id.url);
    if (!o) {
      o = { source: id.source, siteId: id.siteId, url: id.url, title: '', subject, receivedAt: date };
      offers.set(id.url, o);
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
    // Version texte : « Intitulé » sur la ligne qui précède l'URL, quand il y en a une.
    const lines = msg.text.split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/https?:\/\/[^\s<>"]+/g)) {
        const before = (line.slice(0, m.index).trim() || (lines[i - 1] ?? '').trim()).replace(/\s*[:\-–<(]+$/, '');
        keep(m[0], before);
      }
    });
  }
  // Collective : les liens disent « Voir l'offre » ; l'intitulé est dans le texte (« Offre : … Postuler »).
  const list = [...offers.values()];
  if (list.length === 1 && !list[0].title && msg.html) {
    const m = textHtml(msg.html).match(/Offre\s*:\s*(.+?)\s+Postuler\b/);
    if (m) list[0].title = m[1].trim().slice(0, 140);
  }
  for (const o of list) {
    if (o.source === 'glassdoor' && o.title) Object.assign(o, splitGlassdoor(o.title));
  }
  return { subject, date, offers: list, confirmation: SUBJECT_CONFIRMATION.test(subject) };
}

/** Champs tirés du bloc d'une offre Glassdoor, dont le lien contient tout à la suite. */
export interface BlockGlassdoor {
  title: string;
  company?: string;
  location?: string;
  compensation?: string;
}

/** Mentions de genre qui terminent l'intitulé (le lieu suit). */
const KIND = /^(.*?(?:\(?\b(?:H\s*\/\s*F|F\s*\/\s*H)(?:\s*\/\s*[NX])?\)?|\((?:m\s*\/\s*w\s*\/\s*d|w\s*\/\s*m\s*\/\s*d|f\s*\/\s*m\s*\/\s*d)\)))\s+(.+)$/i;

/**
 * Glassdoor met dans le lien : « Entreprise 4.0 ★ Intitulé (H/F) Lieu 50 k € - 65 k € (Estimation de l'employeur) 17h
 * Candidature facile ». On sépare ce qui peut l'être sans risque ; le reste reste dans l'intitulé.
 */
export function splitGlassdoor(raw: string): BlockGlassdoor {
  let t = raw.replace(/\s+/g, ' ').trim();
  t = t.replace(/\s+Candidature\b.*$/i, '').trim();
  t = t.replace(/\s+\d{1,2}\s*(?:h|j|d)\+?$/i, '').trim();
  const r: BlockGlassdoor = { title: t };
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
