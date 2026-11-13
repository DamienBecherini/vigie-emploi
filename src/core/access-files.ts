// Accès aux fichiers de l'espace de travail pour une IA sans accès direct au disque (client MCP seul) :
// lister, lire, écrire, déplacer, toujours à l'intérieur du dossier de données.
// Sécurité : chemins relatifs (ou absolus mais dans l'espace), sans « .. » ni segment caché, jamais dans data/
// (la base), et qui restent dans l'espace une fois les liens symboliques résolus. Aucune suppression.
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { t } from '../i18n/index.ts';

/** Premier segment interdit : la base SQLite et ses fichiers. */
const FOLDERS_FORBIDDEN = new Set(['data']);
/** Extensions qu'ecrire_fichier accepte (texte seulement). */
export const EXTENSIONS_WRITE = ['.md', '.txt', '.json', '.csv', '.yml', '.yaml', '.css'];
/** Fichiers lus comme du texte. */
const EXTENSIONS_TEXT = new Set([...EXTENSIONS_WRITE, '.eml', '.html', '.htm', '.xml', '.log', '.ini', '.toml']);
export const SIZE_MAX_TEXT = 2 * 1024 * 1024;
export const SIZE_MAX_BINARY = 15 * 1024 * 1024;
const INPUTS_MAX = 500;

export function refuse(message: string): never {
  throw Object.assign(new Error(message), { user: true });
}

const slash = (p: string) => p.split(sep).join('/');

function isIn(root: string, path: string): boolean {
  const r = process.platform === 'win32' ? root.toLowerCase() : root;
  const c = process.platform === 'win32' ? path.toLowerCase() : path;
  return c === r || c.startsWith(r.endsWith(sep) ? r : r + sep);
}

function checkSegments(segments: string[], raw: string): void {
  for (const s of segments) {
    if (s === '..' || s.startsWith('.')) refuse(t('core.access.pathCache', { path: raw }));
    // Windows ignore les points et espaces finaux (« data. » = « data ») ; « : » ouvrirait un flux alternatif.
    if (/[.\s]$/.test(s) || /[:*?"<>|]/.test(s)) refuse(t('core.pathInvalid', { path: raw }));
  }
  if (segments.length && FOLDERS_FORBIDDEN.has(segments[0].toLowerCase())) {
    refuse(t('core.access.data', { path: raw }));
  }
}

export interface SafePath {
  /** Chemin absolu (liens résolus quand le fichier existe). */
  absolute: string;
  /** Chemin relatif à l'espace, avec des barres obliques ('' pour la racine). */
  relative: string;
  exists: boolean;
}

/**
 * Résout un chemin donné par l'IA dans l'espace `racineEspace`, ou lève une erreur.
 * Accepte un chemin relatif, ou absolu s'il est dans l'espace. Le fichier peut ne pas exister (écriture) :
 * on vérifie alors le dossier existant le plus proche.
 */
export function pathInWorkspace(rootWorkspace: string, path: string): SafePath {
  const raw = String(path ?? '').trim();
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(raw)) refuse(t('core.pathInvalid', { path: raw }));
  const root = realpathSync(resolve(rootWorkspace));
  let rel = raw.replace(/\\/g, '/');
  if (isAbsolute(rel) || /^[a-z]:/i.test(rel) || rel.startsWith('/')) {
    const abs = resolve(rel);
    const anchor = existsSync(abs) ? realpathSync(abs) : abs;
    const rootRaw = resolve(rootWorkspace);
    if (isIn(root, anchor)) rel = slash(relative(root, anchor));
    else if (isIn(rootRaw, abs)) rel = slash(relative(rootRaw, abs));
    else refuse(t('core.access.outWorkspace', { path: raw }));
  }
  const segments = rel.split('/').filter((s) => s !== '' && s !== '.');
  checkSegments(segments, raw);
  const target = resolve(root, ...segments);

  // Dossier existant le plus proche : une fois les liens résolus, il doit rester dans l'espace.
  let anchor = target;
  while (!existsSync(anchor)) anchor = dirname(anchor);
  const real = realpathSync(anchor);
  if (!isIn(root, real)) refuse(t('core.access.sort', { path: raw }));
  const relReal = slash(relative(root, real));
  if (relReal && FOLDERS_FORBIDDEN.has(relReal.split('/')[0].toLowerCase())) refuse(t('core.accessRefused', { path: raw }));
  const exists = anchor === target;
  return { absolute: exists ? real : target, relative: segments.join('/'), exists };
}

export interface Input {
  path: string;
  type: 'file' | 'folder';
  size?: number;
  modified_at: string;
}

/** Contenu d'un dossier de l'espace, sur `profondeur` niveaux (1 = le dossier seul, 4 au plus). */
export function listWorkspace(rootWorkspace: string, folder = '.', depth = 1): { folder: string; inputs: Input[]; truncated: boolean } {
  const p = Math.min(Math.max(Math.trunc(depth) || 1, 1), 4);
  const c = pathInWorkspace(rootWorkspace, folder || '.');
  if (!c.exists) refuse(t('core.access.folderNotFound', { path: c.relative || '.' }));
  if (!statSync(c.absolute).isDirectory()) refuse(t('core.access.notOneFolder', { path: c.relative }));
  const root = realpathSync(resolve(rootWorkspace));
  const inputs: Input[] = [];
  let truncated = false;
  const walk = (abs: string, level: number) => {
    const list = readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const ent of list) {
      if (ent.name.startsWith('.')) continue;
      const child = join(abs, ent.name);
      const rel = slash(relative(root, child));
      if (FOLDERS_FORBIDDEN.has(rel.split('/')[0].toLowerCase())) continue;
      if (inputs.length >= INPUTS_MAX) {
        truncated = true;
        return;
      }
      let st;
      try {
        st = statSync(child);
        if (!isIn(root, realpathSync(child))) continue;
      } catch {
        continue;
      }
      const modified_at = st.mtime.toISOString().replace(/\.\d{3}Z$/, 'Z');
      if (st.isDirectory()) {
        inputs.push({ path: `${rel}/`, type: 'folder', modified_at });
        if (level < p) walk(child, level + 1);
      } else if (st.isFile()) {
        inputs.push({ path: rel, type: 'file', size: st.size, modified_at });
      }
    }
  };
  walk(c.absolute, 1);
  return { folder: c.relative || '.', inputs, truncated };
}

export type Reading =
  | { kind: 'text'; path: string; text: string; size: number }
  | { kind: 'binary'; path: string; extension: string; data: Buffer; size: number };

/** Lit un fichier de l'espace : texte (UTF-8) ou octets bruts pour le reste (PDF, images, Word…). */
export function readWorkspace(rootWorkspace: string, path: string): Reading {
  const c = pathInWorkspace(rootWorkspace, path);
  if (!c.exists) refuse(t('core.fileNotFound', { path: c.relative }));
  const st = statSync(c.absolute);
  if (st.isDirectory()) refuse(t('core.access.isOneFolder', { path: c.relative }));
  const ext = extname(c.absolute).toLowerCase();
  if (EXTENSIONS_TEXT.has(ext) || ext === '') {
    if (st.size > SIZE_MAX_TEXT) refuse(t('core.access.tooBigText', { path: c.relative, size: st.size }));
    return { kind: 'text', path: c.relative, text: readFileSync(c.absolute, 'utf8').replace(/^﻿/, ''), size: st.size };
  }
  if (st.size > SIZE_MAX_BINARY) refuse(t('core.access.tooBig', { path: c.relative, size: st.size }));
  return { kind: 'binary', path: c.relative, extension: ext, data: readFileSync(c.absolute), size: st.size };
}

export interface ResultWrite {
  path: string;
  /** true si un fichier existait déjà à cet endroit (il a été remplacé). */
  existed: boolean;
  old_size: number | null;
  size: number;
}

/** Crée ou remplace un fichier texte de l'espace (dossiers parents créés). `creerSeulement` refuse d'écraser. */
export function writeWorkspace(rootWorkspace: string, path: string, content: string, o: { createOnly?: boolean } = {}): ResultWrite {
  const c = pathInWorkspace(rootWorkspace, path);
  const ext = extname(c.absolute).toLowerCase();
  if (!EXTENSIONS_WRITE.includes(ext)) {
    refuse(t('core.access.extension', { ext: ext || t('core.access.withoutExtension'), list: EXTENSIONS_WRITE.join(', ') }));
  }
  if (Buffer.byteLength(content, 'utf8') > SIZE_MAX_TEXT) refuse(t('core.access.tooLong'));
  let old: number | null = null;
  if (c.exists) {
    const st = statSync(c.absolute);
    if (!st.isFile()) refuse(t('core.notOneFile', { path: c.relative }));
    if (o.createOnly) refuse(t('core.access.exists', { path: c.relative }));
    old = st.size;
  } else {
    mkdirSync(dirname(c.absolute), { recursive: true });
  }
  writeFileSync(c.absolute, content, 'utf8');
  return { path: c.relative, existed: c.exists, old_size: old, size: statSync(c.absolute).size };
}

/** Déplace ou renomme un fichier dans l'espace ; refuse d'écraser une destination existante. */
export function moveWorkspace(rootWorkspace: string, source: string, destination: string): { source: string; destination: string } {
  const s = pathInWorkspace(rootWorkspace, source);
  if (!s.exists) refuse(t('core.fileNotFound', { path: s.relative }));
  if (!statSync(s.absolute).isFile()) refuse(t('core.access.moveFile', { path: s.relative }));
  const d = pathInWorkspace(rootWorkspace, destination);
  if (d.exists) refuse(t('core.access.destination', { path: d.relative }));
  mkdirSync(dirname(d.absolute), { recursive: true });
  renameSync(s.absolute, d.absolute);
  return { source: s.relative, destination: d.relative };
}
