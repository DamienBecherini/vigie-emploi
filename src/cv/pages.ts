// Contrôle de la mise en page d'un CV sur le PDF réel (et non sur le rendu HTML écran) :
// - remplissage de chaque page, d'après la position verticale des éléments de texte (unpdf) ;
// - capture des vraies pages, rendues par pdf.js (livré par unpdf) dans le navigateur headless.
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export interface PageRemplie {
  page: number;
  /** Part de la hauteur utile occupée, en % (du haut de la zone de contenu au bas du dernier texte). */
  remplissage: number;
}

export interface AnalysePages {
  pages: PageRemplie[];
  /** Saut de page mal placé, dernière page presque vide… (vide si la mise en page est correcte). */
  avertissements: string[];
}

/** Seuils : une page avant la dernière doit être pleine ; la dernière, au moins à moitié. */
export const SEUIL_PAGE_PLEINE = 80;
export const SEUIL_DERNIERE_PAGE = 50;
/** En dessous, simple remarque sur la place restante en dernière page. */
export const SEUIL_DERNIERE_CONFORTABLE = 75;

/** Bas d'une ligne de texte sous sa ligne de base (jambages), en part de la taille de police. */
const DESCENTE = 0.25;

interface Boite {
  haut: number;
  bas: number;
}

/**
 * Remplissage des pages d'un PDF. La hauteur utile est la page moins les marges, estimées d'après le texte :
 * marge haute = plus petit écart entre le haut de page et le premier texte, toutes pages confondues ;
 * marge basse = la même (les gabarits ont des marges haute et basse voisines).
 */
export async function analyserPages(donnees: Uint8Array): Promise<AnalysePages> {
  if (!donnees.length) throw new Error('PDF vide');
  const { getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(donnees));
  const boites: { hauteur: number; texte: Boite | null }[] = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const page = await pdf.getPage(n);
    const hauteur = page.getViewport({ scale: 1 }).height;
    const contenu = await page.getTextContent();
    let haut = Infinity;
    let bas = -Infinity;
    for (const item of contenu.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const t = item.transform as number[];
      const taille = Math.hypot(t[2] ?? 0, t[3] ?? 0) || item.height || 0;
      const base = hauteur - (t[5] ?? 0);
      haut = Math.min(haut, base - taille);
      bas = Math.max(bas, base + taille * DESCENTE);
    }
    boites.push({ hauteur, texte: Number.isFinite(haut) ? { haut, bas } : null });
  }
  await pdf.cleanup();
  return remplissage(boites);
}

/** Calcul pur (testé à part) : boîtes de texte par page → remplissage et avertissements. */
export function remplissage(boites: { hauteur: number; texte: Boite | null }[]): AnalysePages {
  const marges = boites.filter((b) => b.texte).map((b) => Math.max(0, b.texte!.haut));
  const marge = marges.length ? Math.min(...marges) : 0;
  const pages = boites.map((b, i): PageRemplie => {
    const utile = b.hauteur - 2 * marge;
    const occupe = b.texte ? b.texte.bas - marge : 0;
    const pc = utile > 0 ? Math.round(Math.min(100, Math.max(0, (occupe / utile) * 100))) : 0;
    return { page: i + 1, remplissage: pc };
  });
  const avertissements: string[] = [];
  pages.forEach((p, i) => {
    const derniere = i === pages.length - 1;
    if (!derniere && p.remplissage < SEUIL_PAGE_PLEINE) {
      avertissements.push(
        `Page ${p.page} remplie à ${p.remplissage} % seulement alors qu'une page suit : saut de page mal placé ` +
          '(bloc insécable trop haut, saut forcé) ; resserrer ou déplacer le contenu pour remplir la page.',
      );
    }
    if (derniere && pages.length > 1 && p.remplissage < SEUIL_DERNIERE_PAGE) {
      avertissements.push(
        `Dernière page (${p.page}) remplie à ${p.remplissage} % : beaucoup de vide ; étoffer avec du contenu vrai et utile ` +
          "à l'offre, ou condenser pour tenir en une page de moins.",
      );
    } else if (derniere && pages.length > 1 && p.remplissage < SEUIL_DERNIERE_CONFORTABLE) {
      avertissements.push(
        `Remarque : dernière page (${p.page}) remplie à ${p.remplissage} %, il reste environ ${100 - p.remplissage} % de page vide ; ` +
          "acceptable, mais de la place pour un élément utile à l'offre s'il en manque.",
      );
    }
  });
  return { pages, avertissements };
}

/** « 96 %, 58 % » pour l'affichage. */
export function formaterRemplissage(a: AnalysePages): string {
  return a.pages.map((p) => `${p.remplissage} %`).join(', ');
}

// ---------------------------------------------------------------------------------------------
// Capture des vraies pages

/** Largeur de rendu d'une page A4 en pixels (hauteur au prorata). */
const LARGEUR_PAGE = 794;
const ECART = 16;

/** Chemin du module pdf.js complet livré par unpdf (rendu sur canvas, sans worker séparé). */
function cheminPdfjs(): string {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve('unpdf')), 'pdfjs.mjs');
}

function urlFichier(chemin: string): string {
  const p = chemin.replace(/\\/g, '/');
  return p.startsWith('//') ? `file:${encodeURI(p)}` : `file:///${encodeURI(p.replace(/^\/+/, ''))}`;
}

/**
 * Image PNG des pages réelles du PDF, l'une sous l'autre (fond gris, bord de page visible) : le PDF est rendu
 * par pdf.js dans le navigateur headless. Le PDF est embarqué dans la page HTML (base64) ; seul pdf.js est
 * chargé depuis le disque (d'où --allow-file-access-from-files).
 */
export function capturerPages(
  pdf: string,
  png: string,
  navigateur: string,
  o: { pages: number; hauteurPage?: number; env?: NodeJS.ProcessEnv },
): void {
  const html = png.replace(/\.png$/i, '.pages.html');
  const hauteurPage = o.hauteurPage ?? Math.round((LARGEUR_PAGE * 297) / 210);
  const pages = Math.max(1, o.pages);
  const donnees = readFileSync(pdf).toString('base64');
  writeFileSync(
    html,
    `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#9a9a9a}
canvas{display:block;margin:0 0 ${ECART}px 0;background:#fff;width:${LARGEUR_PAGE}px;height:${hauteurPage}px}
#erreur{font:16px sans-serif;color:#900;padding:20px;background:#fff}
</style></head><body>
<script type="module">
import { getDocument } from ${JSON.stringify(urlFichier(cheminPdfjs()))};
const b = atob(${JSON.stringify(donnees)});
const octets = new Uint8Array(b.length);
for (let i = 0; i < b.length; i++) octets[i] = b.charCodeAt(i);
try {
  const doc = await getDocument({ data: octets, isEvalSupported: false, useSystemFonts: false }).promise;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const v1 = page.getViewport({ scale: 1 });
    const v = page.getViewport({ scale: ${LARGEUR_PAGE} / v1.width });
    const c = document.createElement('canvas');
    c.width = Math.round(v.width);
    c.height = Math.round(v.height);
    document.body.appendChild(c);
    await page.render({ canvasContext: c.getContext('2d'), viewport: v, canvas: c }).promise;
  }
  document.title = 'rendu';
} catch (e) {
  const d = document.createElement('div');
  d.id = 'erreur';
  d.textContent = 'Rendu du PDF impossible : ' + e;
  document.body.appendChild(d);
}
</script></body></html>`,
    'utf8',
  );
  execFileSync(
    navigateur,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--allow-file-access-from-files',
      `--window-size=${LARGEUR_PAGE},${pages * (hauteurPage + ECART) - ECART}`,
      '--virtual-time-budget=15000',
      `--screenshot=${png}`,
      urlFichier(html),
    ],
    { stdio: 'pipe', env: o.env ?? process.env },
  );
  rmSync(html, { force: true });
}
