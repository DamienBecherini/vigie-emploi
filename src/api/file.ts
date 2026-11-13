// Lecture d'un fichier du dossier de données par le tableau de bord : Markdown rendu en HTML simple,
// texte en texte brut, PDF et images tels quels, le reste en téléchargement. Une page HTML du dossier
// n'est jamais servie comme HTML (texte brut), et le Markdown rendu ne peut exécuter aucun script (CSP).
import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { Marked } from 'marked';

const TEXT = new Set(['.txt', '.json', '.csv', '.log', '.eml', '.yml', '.yaml', '.xml', '.html', '.htm', '.ts', '.js', '.py', '.sql']);
const BINARIES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/** Aucun script, aucune ressource externe : seulement les styles en ligne et les images du dossier. */
const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'";

const marked = new Marked({ gfm: true, breaks: false });

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const STYLE = `
:root { color-scheme: light dark; --fond: #fff; --texte: #0f172a; --doux: #475569; --bord: #cbd5e1; --lien: #1d4ed8; --code: #f1f5f9; }
@media (prefers-color-scheme: dark) { :root { --fond: #020617; --texte: #f1f5f9; --doux: #94a3b8; --bord: #334155; --lien: #93c5fd; --code: #1e293b; } }
body { background: var(--fond); color: var(--texte); font: 16px/1.6 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; margin: 0; }
main { max-width: 52rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
header { color: var(--doux); font-size: .85rem; border-bottom: 1px solid var(--bord); padding-bottom: .5rem; margin-bottom: 1rem; display: flex; gap: 1rem; flex-wrap: wrap; }
a { color: var(--lien); }
table { border-collapse: collapse; display: block; overflow-x: auto; margin: 1rem 0; font-size: .92rem; }
th, td { border: 1px solid var(--bord); padding: .3rem .5rem; vertical-align: top; text-align: left; }
code, pre { background: var(--code); border-radius: 4px; font-size: .9em; }
code { padding: 0 .25rem; }
pre { padding: .75rem; overflow-x: auto; white-space: pre-wrap; }
blockquote { border-left: 3px solid var(--bord); margin: 0; padding-left: 1rem; color: var(--doux); }
img { max-width: 100%; }
`;

export interface PageFile {
  body: string | Uint8Array<ArrayBuffer>;
  headers: Record<string, string>;
}

export function pageFile(absolute: string, relative: string, o: { raw?: boolean } = {}): PageFile {
  const ext = extname(absolute).toLowerCase();
  const name = basename(absolute);
  const common = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache', 'Referrer-Policy': 'no-referrer' };
  if (ext === '.md' && !o.raw) {
    const source = readFileSync(absolute, 'utf8').replace(/^﻿/, '');
    const html = marked.parse(source, { async: false });
    const page = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(name)}</title><style>${STYLE}</style></head>
<body><main><header><span>${escape(relative)}</span><a href="?raw=1">Texte brut</a></header>
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
