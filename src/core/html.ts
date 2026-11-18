// Plain text of an HTML fragment (e-mail link, description of a job ad).
import { decodeHTML } from 'entities';

/** Plain text of an HTML fragment (tags removed, entities decoded, spaces collapsed). */
export function textHtml(fragment: string): string {
  return decodeHTML(fragment.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Multi-line HTML text (paragraphs and lists kept), for descriptions. */
export function textHtmlLines(fragment: string): string {
  return decodeHTML(
    fragment
      .replace(/<\s*(br|\/p|\/li|\/h\d|\/div|\/ul|\/ol)\b[^>]*>/gi, '\n')
      .replace(/<\s*li\b[^>]*>/gi, '\n- ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export { decodeHTML };
