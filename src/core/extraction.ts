// Text of a document dropped by the user (CV, LinkedIn export…) for an AI that does not read the disk:
// PDF through unpdf (pdf.js without dependencies, loaded on demand), Word (.docx) by reading the archive directly.
import { inflateRawSync } from 'node:zlib';

/**
 * Text of a PDF, page by page (empty array if the PDF has no text layer: scan, image), and the addresses of the links
 * of each page: in a CV, the URL of the GitHub or LinkedIn profile often hides behind a single word ("GitHub").
 */
export async function textPdf(data: Uint8Array): Promise<{ pages: number; text: string[]; links: string[][] }> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const r = await extractText(pdf, { mergePages: false });
  const links: string[][] = [];
  for (let i = 1; i <= r.totalPages; i += 1) {
    try {
      const annotations = (await (await pdf.getPage(i)).getAnnotations()) as { subtype?: string; url?: string; unsafeUrl?: string }[];
      const urls = annotations
        .filter((a) => a.subtype === 'Link')
        .map((a) => a.url ?? a.unsafeUrl)
        .filter((u): u is string => Boolean(u));
      links.push([...new Set(urls)]);
    } catch {
      links.push([]);
    }
  }
  return { pages: r.totalPages, text: (r.text as string[]).map((t) => t.replace(/[ \t]+\n/g, '\n').trim()), links };
}

/** File of a ZIP archive ("stored" and "deflate" methods), or null if it is not in it. */
function fileZip(zip: Buffer, name: string): Buffer | null {
  // End of the central directory: signature 0x06054b50, searched from the end.
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i -= 1) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  const number = zip.readUInt16LE(end + 10);
  let p = zip.readUInt32LE(end + 16);
  for (let n = 0; n < number && p + 46 <= zip.length; n += 1) {
    if (zip.readUInt32LE(p) !== 0x02014b50) return null;
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const nameFile = zip.toString('utf8', p + 46, p + 46 + nameLen);
    if (nameFile === name) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const raw = zip.subarray(start, start + size);
      if (method === 0) return Buffer.from(raw);
      if (method === 8) return inflateRawSync(raw);
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Text of a Word .docx document (paragraphs, flattened tables), or null if the archive is unreadable. */
export function textDocx(data: Buffer): string | null {
  const xml = fileZip(data, 'word/document.xml');
  if (!xml) return null;
  return xml
    .toString('utf8')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/w:tc>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|apos);/g, (_m, e: string) => ENTITIES[e])
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const TYPES_IMAGE: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};
