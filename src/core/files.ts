// Files of the application folder: list (name, size, date) and read access, strictly limited
// to the data folder (no path traversal, no hidden files, neither the database nor the inbox).
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Database } from '../db/database.ts';
import { applicationOf } from './offers.ts';
import { pathRelative } from './events.ts';
import { t } from '../i18n/index.ts';
import { AppError } from './errors.ts';

export interface FileFolder {
  /** Path relative to the data folder (forward slashes): the one to put in an event. */
  path: string;
  /** Path relative to the application folder. */
  name: string;
  size: number;
  modified_at: string;
}

export interface FilesFolder {
  offer_id: number;
  /** Application folder (relative to the data folder), or null if the application has none. */
  folder: string | null;
  exists: boolean;
  files: FileFolder[];
  /** true if the list was cut (too many files). */
  truncated: boolean;
}

/** First-level folders never served: the database and the inbox. */
const FOLDERS_FORBIDDEN = new Set(['data', 'emails']);
const DEPTH_MAX = 4;
const FILES_MAX = 500;

/**
 * Absolute path of a file of the data folder, after checking: relative path without ".." nor
 * hidden segment, outside data/ and emails/, and which stays inside the folder once symbolic links are resolved.
 * Throws an error otherwise (or if the file does not exist).
 */
/** Forbidden first-level folder? Trailing dots and spaces are ignored, as Windows does ("data." is "data"). */
function forbidden(firstSegment: string): boolean {
  return FOLDERS_FORBIDDEN.has(firstSegment.replace(/[.\s]+$/, '').toLowerCase());
}

export function safeFile(dataDir: string, path: string): { absolute: string; relative: string } {
  const rel = pathRelative(path);
  if (forbidden(rel.split('/')[0])) throw new AppError('forbidden', t('core.accessRefused', { path }));
  const root = realpathSync(resolve(dataDir));
  const target = resolve(root, ...rel.split('/'));
  if (!existsSync(target)) throw new AppError('not-found', t('core.fileNotFound', { path: rel }));
  const real = realpathSync(target);
  if (real !== root && !real.startsWith(root + sep)) throw new AppError('forbidden', t('core.accessRefused', { path }));
  // Checked again once links are resolved: a symbolic link inside the folder may lead to data/ or emails/.
  if (forbidden(relative(root, real).split(sep)[0])) throw new AppError('forbidden', t('core.accessRefused', { path }));
  if (!statSync(real).isFile()) throw new AppError('invalid', t('core.notOneFile', { path: rel }));
  return { absolute: real, relative: rel };
}

/**
 * Absolute path of a folder relative to the data folder, if it exists and stays inside once symbolic links
 * are resolved (neither data/ nor emails/). Throws an error otherwise. Used to open it in the file explorer.
 */
export function safeFolder(dataDir: string, folder: string): string {
  const rel = pathRelative(folder);
  if (FOLDERS_FORBIDDEN.has(rel.split('/')[0].toLowerCase())) throw new AppError('forbidden', t('core.accessRefused', { path: folder }));
  const root = realpathSync(resolve(dataDir));
  const target = resolve(root, ...rel.split('/'));
  if (!existsSync(target)) throw new AppError('not-found', t('core.fileNotFound', { path: rel }));
  const real = realpathSync(target);
  if (!real.startsWith(root + sep)) throw new AppError('forbidden', t('core.accessRefused', { path: folder }));
  if (!statSync(real).isDirectory()) throw new AppError('invalid', t('core.notOneFolder', { path: rel }));
  return real;
}

/** Files (recursively, without hidden files and folders) of a folder relative to the data folder. */
export function listFiles(dataDir: string, folder: string): { exists: boolean; files: FileFolder[]; truncated: boolean } {
  const rel = pathRelative(folder);
  const root = realpathSync(resolve(dataDir));
  const dir = resolve(root, ...rel.split('/'));
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return { exists: false, files: [], truncated: false };
  const realDatabase = realpathSync(dir);
  if (!realDatabase.startsWith(root + sep)) throw new AppError('forbidden', t('core.accessRefused', { path: folder }));
  const files: FileFolder[] = [];
  let truncated = false;
  const walk = (dir: string, depth: number) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith('.')) continue;
      const abs = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (depth < DEPTH_MAX) walk(abs, depth + 1);
        continue;
      }
      if (!ent.isFile()) continue;
      if (files.length >= FILES_MAX) {
        truncated = true;
        return;
      }
      const st = statSync(abs);
      files.push({
        path: relative(root, abs).split(sep).join('/'),
        name: relative(realDatabase, abs).split(sep).join('/'),
        size: st.size,
        modified_at: st.mtime.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      });
    }
  };
  walk(realDatabase, 1);
  // The folder's sheet first, then from the most recent to the oldest.
  files.sort((a, b) =>
    a.name === 'dossier-candidature.md'
      ? -1
      : b.name === 'dossier-candidature.md'
        ? 1
        : b.modified_at.localeCompare(a.modified_at) || a.name.localeCompare(b.name),
  );
  return { exists: true, files, truncated };
}

/** Files of the application folder of an offer (empty list if the application has no folder). */
export function filesFolder(db: Database, dataDir: string, offerId: number): FilesFolder {
  const folder = applicationOf(db, offerId)?.folder ?? null;
  if (!folder) return { offer_id: offerId, folder: null, exists: false, files: [], truncated: false };
  return { offer_id: offerId, folder, ...listFiles(dataDir, folder) };
}
