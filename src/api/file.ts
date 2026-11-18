// Reading of a file of the data folder by the dashboard: Markdown rendered as simple HTML,
// text as plain text, PDF and images as they are, the rest as a download. An HTML page of the folder
// is never served as HTML (plain text), and the rendered Markdown cannot run any script (CSP).
import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { Marked } from 'marked';
import { LANGUAGE_DEFAULT, tl, type Language } from '../i18n/index.ts';

const TEXT = new Set(['.txt', '.json', '.csv', '.log', '.eml', '.yml', '.yaml', '.xml', '.html', '.htm', '.ts', '.js', '.py', '.sql']);
const BINARIES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/** No script, no external resource: only inline styles and the folder's images. */
const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'";

const marked = new Marked({ gfm: true, breaks: false });

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const STYLE = `
:root { color-scheme: light dark; --bg: #fff; --text: #0f172a; --muted: #475569; --border: #cbd5e1; --link: #1d4ed8; --code: #f1f5f9; }
@media (prefers-color-scheme: dark) { :root { --bg: #020617; --text: #f1f5f9; --muted: #94a3b8; --border: #334155; --link: #93c5fd; --code: #1e293b; } }
body { background: var(--bg); color: var(--text); font: 16px/1.6 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; margin: 0; }
main { max-width: 52rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
header { color: var(--muted); font-size: .85rem; border-bottom: 1px solid var(--border); padding-bottom: .5rem; margin-bottom: 1rem; display: flex; gap: 1rem; flex-wrap: wrap; }
a { color: var(--link); }
table { border-collapse: collapse; display: block; overflow-x: auto; margin: 1rem 0; font-size: .92rem; }
th, td { border: 1px solid var(--border); padding: .3rem .5rem; vertical-align: top; text-align: left; }
code, pre { background: var(--code); border-radius: 4px; font-size: .9em; }
code { padding: 0 .25rem; }
pre { padding: .75rem; overflow-x: auto; white-space: pre-wrap; }
blockquote { border-left: 3px solid var(--border); margin: 0; padding-left: 1rem; color: var(--muted); }
img { max-width: 100%; }
`;

export interface PageFile {
  body: string | Uint8Array<ArrayBuffer>;
  headers: Record<string, string>;
}

export function pageFile(absolute: string, relative: string, o: { raw?: boolean; language?: Language } = {}): PageFile {
  const ext = extname(absolute).toLowerCase();
  const name = basename(absolute);
  const common = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache', 'Referrer-Policy': 'no-referrer' };
  if (ext === '.md' && !o.raw) {
    const source = readFileSync(absolute, 'utf8').replace(/^﻿/, '');
    const html = marked.parse(source, { async: false });
    const language = o.language ?? LANGUAGE_DEFAULT;
    const page = `<!doctype html>
<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(name)}</title><style>${STYLE}</style></head>
<body><main><header><span>${escapeHtml(relative)}</span><a href="?raw=1">${tl(language, 'api.fileRaw')}</a></header>
${html}
</main></body></html>`;
    return { body: page, headers: { ...common, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP } };
  }
  if (ext === '.md' || TEXT.has(ext)) {
    return {
      body: readFileSync(absolute, 'utf8'),
      headers: { ...common, 'Content-Type': 'text/plain; charset=utf-8', 'Content-Security-Policy': CSP },
    };
  }
  const data = new Uint8Array(readFileSync(absolute));
  const type = BINARIES[ext];
  if (type) {
    return { body: data, headers: { ...common, 'Content-Type': type, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(name)}` } };
  }
  return {
    body: data,
    headers: { ...common, 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}` },
  };
}
