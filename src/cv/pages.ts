// Layout check of a CV on the real PDF (and not on the on-screen HTML rendering):
// - fill of each page, from the vertical position of the text elements (unpdf);
// - capture of the real pages, rendered by pdf.js (shipped with unpdf) in the headless browser.
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { t } from '../i18n/index.ts';

export interface PageFilled {
  page: number;
  /** Share of the usable height that is filled, in % (from the top of the content area to the bottom of the last text). */
  fill: number;
}

export interface AnalysisPages {
  pages: PageFilled[];
  /** Badly placed page break, last page almost empty… (empty if the layout is correct). */
  warnings: string[];
}

/** Thresholds: a page before the last one must be full; the last one, at least half. */
export const THRESHOLD_PAGE_FULL = 80;
export const THRESHOLD_LAST_PAGE = 50;
/** Below, a simple remark about the room left on the last page. */
export const THRESHOLD_LAST_COMFORTABLE = 75;

/** Bottom of a text line below its baseline (descenders), as a share of the font size. */
const DESCENT = 0.25;

interface Box {
  high: number;
  low: number;
}

/**
 * Fill of the pages of a PDF. The usable height is the page minus the margins, estimated from the text:
 * top margin = smallest gap between the top of the page and the first text, all pages together;
 * bottom margin = the same (the templates have similar top and bottom margins).
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

/** Pure computation (tested separately): text boxes per page → fill and warnings. */
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

/** "96 %, 58 %" for display. */
export function formatFill(a: AnalysisPages): string {
  return a.pages.map((p) => t('core.pages.percent', { pc: p.fill })).join(', ');
}

// ---------------------------------------------------------------------------------------------
// Capture of the real pages

/** Rendering width of an A4 page in pixels (height in proportion). */
const WIDTH_PAGE = 794;
const GAP = 16;

/** Path of the full pdf.js module shipped by unpdf (rendering on canvas, without a separate worker). */
function pathPdfjs(): string {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve('unpdf')), 'pdfjs.mjs');
}

function urlFile(path: string): string {
  const p = path.replace(/\\/g, '/');
  return p.startsWith('//') ? `file:${encodeURI(p)}` : `file:///${encodeURI(p.replace(/^\/+/, ''))}`;
}

/**
 * PNG image of the real pages of the PDF, one below the other (grey background, visible page edge): the PDF is rendered
 * by pdf.js in the headless browser. The PDF is embedded in the HTML page (base64); only pdf.js is
 * loaded from the disk (hence --allow-file-access-from-files).
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
