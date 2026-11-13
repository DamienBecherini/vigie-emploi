// Texte d'un document déposé par l'utilisateur (CV, export LinkedIn…) pour une IA qui ne lit pas le disque :
// PDF par unpdf (pdf.js sans dépendance, chargé à la demande), Word (.docx) par lecture directe de l'archive.
import { inflateRawSync } from 'node:zlib';

/**
 * Texte d'un PDF, page par page (tableau vide si le PDF n'a pas de couche texte : scan, image), et les adresses des liens
 * de chaque page : dans un CV, l'URL du profil GitHub ou LinkedIn se cache souvent derrière un simple mot (« GitHub »).
 */
export async function textePdf(donnees: Uint8Array): Promise<{ pages: number; texte: string[]; liens: string[][] }> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(donnees));
  const r = await extractText(pdf, { mergePages: false });
  const liens: string[][] = [];
  for (let i = 1; i <= r.totalPages; i += 1) {
    try {
      const annotations = (await (await pdf.getPage(i)).getAnnotations()) as { subtype?: string; url?: string; unsafeUrl?: string }[];
      const urls = annotations.filter((a) => a.subtype === 'Link').map((a) => a.url ?? a.unsafeUrl).filter((u): u is string => Boolean(u));
      liens.push([...new Set(urls)]);
    } catch {
      liens.push([]);
    }
  }
  return { pages: r.totalPages, texte: (r.text as string[]).map((t) => t.replace(/[ \t]+\n/g, '\n').trim()), liens };
}

/** Fichier d'une archive ZIP (méthodes « stocké » et « deflate »), ou null s'il n'y est pas. */
function fichierZip(zip: Buffer, nom: string): Buffer | null {
  // Fin du répertoire central : signature 0x06054b50, cherchée depuis la fin.
  let fin = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i -= 1) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) return null;
  const nombre = zip.readUInt16LE(fin + 10);
  let p = zip.readUInt32LE(fin + 16);
  for (let n = 0; n < nombre && p + 46 <= zip.length; n += 1) {
    if (zip.readUInt32LE(p) !== 0x02014b50) return null;
    const methode = zip.readUInt16LE(p + 10);
    const taille = zip.readUInt32LE(p + 20);
    const lNom = zip.readUInt16LE(p + 28);
    const lExtra = zip.readUInt16LE(p + 30);
    const lComm = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const nomFichier = zip.toString('utf8', p + 46, p + 46 + lNom);
    if (nomFichier === nom) {
      const debut = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const brut = zip.subarray(debut, debut + taille);
      if (methode === 0) return Buffer.from(brut);
      if (methode === 8) return inflateRawSync(brut);
      return null;
    }
    p += 46 + lNom + lExtra + lComm;
  }
  return null;
}

const ENTITES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Texte d'un document Word .docx (paragraphes, tableaux à plat), ou null si l'archive est illisible. */
export function texteDocx(donnees: Buffer): string | null {
  const xml = fichierZip(donnees, 'word/document.xml');
  if (!xml) return null;
  return xml
    .toString('utf8')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/w:tc>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|apos);/g, (_m, e: string) => ENTITES[e])
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
