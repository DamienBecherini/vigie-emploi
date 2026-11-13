// Contrôle de la mise en page d'un CV sur le PDF réel (et non sur le rendu HTML écran) :
// - remplissage de chaque page, d'après la position verticale des éléments de texte (unpdf) ;
// - capture des vraies pages, rendues par pdf.js (livré par unpdf) dans le navigateur headless.
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { t } from '../i18n/index.ts';

export interface PageFilled {
  page: number;
  /** Part de la hauteur utile occupée, en % (du haut de la zone de contenu au bas du dernier texte). */
  fill: number;
}

export interface AnalysisPages {
  pages: PageFilled[];
  /** Saut de page mal placé, dernière page presque vide… (vide si la mise en page est correcte). */
  warnings: string[];
}

/** Seuils : une page avant la dernière doit être pleine ; la dernière, au moins à moitié. */
export const THRESHOLD_PAGE_FULL = 80;
export const THRESHOLD_LAST_PAGE = 50;
/** En dessous, simple remarque sur la place restante en dernière page. */
export const THRESHOLD_LAST_COMFORTABLE = 75;

/** Bas d'une ligne de texte sous sa ligne de base (jambages), en part de la taille de police. */
const DESCENT = 0.25;

interface Box {
  high: number;
  low: number;
}

/**
 * Remplissage des pages d'un PDF. La hauteur utile est la page moins les marges, estimées d'après le texte :
 * marge haute = plus petit écart entre le haut de page et le premier texte, toutes pages confondues ;
 * marge basse = la même (les gabarits ont des marges haute et basse voisines).
 */
export async function analyzePages(data: Uint8Array): Promise<AnalysisPages> {
  if (!data.length) throw new Error(t('core.pages.pdfEmpty'));
  const { getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const boxes: { height: number; text: Box | null }[] = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const page = await pdf.getPage(n);
    const height = page.getViewport({ scale: 1 }).height;
    const content = await page.getTextContent();
    let high = Infinity;
    let low = -Infinity;
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const t = item.transform as number[];
      const size = Math.hypot(t[2] ?? 0, t[3] ?? 0) || item.height || 0;
      const base = height - (t[5] ?? 0);
      high = Math.min(high, base - size);
      low = Math.max(low, base + size * DESCENT);
    }
    boxes.push({ height, text: Number.isFinite(high) ? { high, low } : null });
  }
  await pdf.cleanup();
  return fill(boxes);
}

/** Calcul pur (testé à part) : boîtes de texte par page → remplissage et avertissements. */
export function fill(boxes: { height: number; text: Box | null }[]): AnalysisPages {
  const margins = boxes.filter((b) => b.text).map((b) => Math.max(0, b.text!.high));
  const margin = margins.length ? Math.min(...margins) : 0;
  const pages = boxes.map((b, i): PageFilled => {
    const useful = b.height - 2 * margin;
    const busy = b.text ? b.text.low - margin : 0;
    const pc = useful > 0 ? Math.round(Math.min(100, Math.max(0, (busy / useful) * 100))) : 0;
    return { page: i + 1, fill: pc };
  });
  const warnings: string[] = [];
  pages.forEach((p, i) => {
    const last = i === pages.length - 1;
    if (!last && p.fill < THRESHOLD_PAGE_FULL) {
      warnings.push(
        t('core.pages.jumpBadlyPlaced', { page: p.page, pc: p.fill }),
      );
    }
    if (last && pages.length > 1 && p.fill < THRESHOLD_LAST_PAGE) {
      warnings.push(
        t('core.pages.lastEmpty', { page: p.page, pc: p.fill }),
      );
    } else if (last && pages.length > 1 && p.fill < THRESHOLD_LAST_COMFORTABLE) {
      warnings.push(
        t('core.pages.lastRemark', { page: p.page, pc: p.fill, empty: 100 - p.fill }),
      );
    }
  });
  return { pages, warnings };
}

/** « 96 %, 58 % » pour l'affichage. */
export function formatFill(a: AnalysisPages): string {
  return a.pages.map((p) => t('core.pages.percent', { pc: p.fill })).join(', ');
}

// ---------------------------------------------------------------------------------------------
// Capture des vraies pages

/** Largeur de rendu d'une page A4 en pixels (hauteur au prorata). */
const WIDTH_PAGE = 794;
const GAP = 16;

/** Chemin du module pdf.js complet livré par unpdf (rendu sur canvas, sans worker séparé). */
function pathPdfjs(): string {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve('unpdf')), 'pdfjs.mjs');
}

function urlFile(path: string): string {
  const p = path.replace(/\\/g, '/');
  return p.startsWith('//') ? `file:${encodeURI(p)}` : `file:///${encodeURI(p.replace(/^\/+/, ''))}`;
}

/**
 * Image PNG des pages réelles du PDF, l'une sous l'autre (fond gris, bord de page visible) : le PDF est rendu
 * par pdf.js dans le navigateur headless. Le PDF est embarqué dans la page HTML (base64) ; seul pdf.js est
 * chargé depuis le disque (d'où --allow-file-access-from-files).
 */
export function capturePages(
  pdf: string,
  png: string,
  browser: string,
  o: { pages: number; heightPage?: number; env?: NodeJS.ProcessEnv },
): void {
  const html = png.replace(/\.png$/i, '.pages.html');
  const heightPage = o.heightPage ?? Math.round((WIDTH_PAGE * 297) / 210);
  const pages = Math.max(1, o.pages);
  const data = readFileSync(pdf).toString('base64');
  writeFileSync(
    html,
    `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#9a9a9a}
canvas{display:block;margin:0 0 ${GAP}px 0;background:#fff;width:${WIDTH_PAGE}px;height:${heightPage}px}
#error{font:16px sans-serif;color:#900;padding:20px;background:#fff}
</style></head><body>
<script type="module">
import { getDocument } from ${JSON.stringify(urlFile(pathPdfjs()))};
const b = atob(${JSON.stringify(data)});
const bytes = new Uint8Array(b.length);
for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i);
try {
  const doc = await getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: false }).promise;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const v1 = page.getViewport({ scale: 1 });
    const v = page.getViewport({ scale: ${WIDTH_PAGE} / v1.width });
    const c = document.createElement('canvas');
    c.width = Math.round(v.width);
    c.height = Math.round(v.height);
    document.body.appendChild(c);
    await page.render({ canvasContext: c.getContext('2d'), viewport: v, canvas: c }).promise;
  }
  document.title = 'rendered';
} catch (e) {
  const d = document.createElement('div');
  d.id = 'error';
  d.textContent = 'Rendu du PDF impossible : ' + e;
  document.body.appendChild(d);
}
</script></body></html>`,
    'utf8',
  );
  execFileSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--allow-file-access-from-files',
      `--window-size=${WIDTH_PAGE},${pages * (heightPage + GAP) - GAP}`,
      '--virtual-time-budget=15000',
      `--screenshot=${png}`,
      urlFile(html),
    ],
    { stdio: 'pipe', env: o.env ?? process.env },
  );
  rmSync(html, { force: true });
}
