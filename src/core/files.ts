// Fichiers du dossier de candidature : liste (nom, taille, date) et accès en lecture, strictement limité
// au dossier de données (aucune traversée de chemin, pas de fichiers cachés, pas de base ni de boîte de réception).
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Database } from '../db/database.ts';
import { applicationOf } from './offers.ts';
import { pathRelative } from './events.ts';
import { t } from '../i18n/index.ts';

export interface FileFolder {
  /** Chemin relatif au dossier de données (barres obliques) : celui à mettre dans un événement. */
  path: string;
  /** Chemin relatif au dossier de candidature. */
  name: string;
  size: number;
  modified_at: string;
}

export interface FilesFolder {
  offer_id: number;
  /** Dossier de candidature (relatif au dossier de données), ou null si la candidature n'en a pas. */
  folder: string | null;
  exists: boolean;
  files: FileFolder[];
  /** true si la liste a été coupée (trop de fichiers). */
  truncated: boolean;
}

/** Dossiers de premier niveau jamais servis : la base et la boîte de réception. */
const FOLDERS_FORBIDDEN = new Set(['data', 'emails']);
const DEPTH_MAX = 4;
const FILES_MAX = 500;

/**
 * Chemin absolu d'un fichier du dossier de données, après vérification : chemin relatif sans « .. » ni
 * segment caché, hors data/ et emails/, et qui reste dans le dossier une fois les liens symboliques résolus.
 * Lève une erreur sinon (ou si le fichier n'existe pas).
 */
export function safeFile(dataDir: string, path: string): { absolute: string; relative: string } {
  const rel = pathRelative(path);
  if (FOLDERS_FORBIDDEN.has(rel.split('/')[0].toLowerCase())) throw new Error(t('core.accessRefused', { path }));
  const root = realpathSync(resolve(dataDir));
  const target = resolve(root, ...rel.split('/'));
  if (!existsSync(target)) throw new Error(t('core.fileNotFound', { path: rel }));
  const real = realpathSync(target);
  if (real !== root && !real.startsWith(root + sep)) throw new Error(t('core.accessRefused', { path }));
  if (!statSync(real).isFile()) throw new Error(t('core.notOneFile', { path: rel }));
  return { absolute: real, relative: rel };
}

/**
 * Chemin absolu d'un dossier relatif au dossier de données, s'il existe et y reste une fois les liens symboliques
 * résolus (ni data/ ni emails/). Lève une erreur sinon. Sert à l'ouvrir dans l'explorateur de fichiers.
 */
export function safeFolder(dataDir: string, folder: string): string {
  const rel = pathRelative(folder);
  if (FOLDERS_FORBIDDEN.has(rel.split('/')[0].toLowerCase())) throw new Error(t('core.accessRefused', { path: folder }));
  const root = realpathSync(resolve(dataDir));
  const target = resolve(root, ...rel.split('/'));
  if (!existsSync(target)) throw new Error(t('core.fileNotFound', { path: rel }));
  const real = realpathSync(target);
  if (!real.startsWith(root + sep)) throw new Error(t('core.accessRefused', { path: folder }));
  if (!statSync(real).isDirectory()) throw new Error(t('core.notOneFolder', { path: rel }));
  return real;
}

/** Fichiers (récursivement, sans les fichiers et dossiers cachés) d'un dossier relatif au dossier de données. */
export function listFiles(dataDir: string, folder: string): { exists: boolean; files: FileFolder[]; truncated: boolean } {
  const rel = pathRelative(folder);
  const root = realpathSync(resolve(dataDir));
  const dir = resolve(root, ...rel.split('/'));
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return { exists: false, files: [], truncated: false };
  const realDatabase = realpathSync(dir);
  if (!realDatabase.startsWith(root + sep)) throw new Error(t('core.accessRefused', { path: folder }));
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
  // La fiche du dossier d'abord, puis du plus récent au plus ancien.
  files.sort((a, b) =>
    a.name === 'dossier-candidature.md' ? -1 : b.name === 'dossier-candidature.md' ? 1 : b.modified_at.localeCompare(a.modified_at) || a.name.localeCompare(b.name),
  );
  return { exists: true, files, truncated };
}

/** Fichiers du dossier de candidature d'une offre (liste vide si la candidature n'a pas de dossier). */
export function filesFolder(db: Database, dataDir: string, offerId: number): FilesFolder {
  const folder = applicationOf(db, offerId)?.folder ?? null;
  if (!folder) return { offer_id: offerId, folder: null, exists: false, files: [], truncated: false };
  return { offer_id: offerId, folder, ...listFiles(dataDir, folder) };
}
