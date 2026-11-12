// Accès aux fichiers de l'espace de travail pour une IA sans accès direct au disque (client MCP seul) :
// lister, lire, écrire, déplacer, toujours à l'intérieur du dossier de données.
// Sécurité : chemins relatifs (ou absolus mais dans l'espace), sans « .. » ni segment caché, jamais dans data/
// (la base), et qui restent dans l'espace une fois les liens symboliques résolus. Aucune suppression.
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** Premier segment interdit : la base SQLite et ses fichiers. */
const DOSSIERS_INTERDITS = new Set(['data']);
/** Extensions qu'ecrire_fichier accepte (texte seulement). */
export const EXTENSIONS_ECRITURE = ['.md', '.txt', '.json', '.csv', '.yml', '.yaml', '.css'];
/** Fichiers lus comme du texte. */
const EXTENSIONS_TEXTE = new Set([...EXTENSIONS_ECRITURE, '.eml', '.html', '.htm', '.xml', '.log', '.ini', '.toml']);
export const TAILLE_MAX_TEXTE = 2 * 1024 * 1024;
export const TAILLE_MAX_BINAIRE = 15 * 1024 * 1024;
const ENTREES_MAX = 500;

export function refuser(message: string): never {
  throw Object.assign(new Error(message), { utilisateur: true });
}

const oblique = (p: string) => p.split(sep).join('/');

function estDans(racine: string, chemin: string): boolean {
  const r = process.platform === 'win32' ? racine.toLowerCase() : racine;
  const c = process.platform === 'win32' ? chemin.toLowerCase() : chemin;
  return c === r || c.startsWith(r.endsWith(sep) ? r : r + sep);
}

function verifierSegments(segments: string[], brut: string): void {
  for (const s of segments) {
    if (s === '..' || s.startsWith('.')) refuser(`Chemin refusé : ${brut} (ni « .. » ni fichier ou dossier caché)`);
    // Windows ignore les points et espaces finaux (« data. » = « data ») ; « : » ouvrirait un flux alternatif.
    if (/[.\s]$/.test(s) || /[:*?"<>|]/.test(s)) refuser(`Chemin invalide : ${brut}`);
  }
  if (segments.length && DOSSIERS_INTERDITS.has(segments[0].toLowerCase())) {
    refuser(`Accès refusé : ${brut} (data/ contient la base ; passer par les outils de l'application)`);
  }
}

export interface CheminSur {
  /** Chemin absolu (liens résolus quand le fichier existe). */
  absolu: string;
  /** Chemin relatif à l'espace, avec des barres obliques ('' pour la racine). */
  relatif: string;
  existe: boolean;
}

/**
 * Résout un chemin donné par l'IA dans l'espace `racineEspace`, ou lève une erreur.
 * Accepte un chemin relatif, ou absolu s'il est dans l'espace. Le fichier peut ne pas exister (écriture) :
 * on vérifie alors le dossier existant le plus proche.
 */
export function cheminDansEspace(racineEspace: string, chemin: string): CheminSur {
  const brut = String(chemin ?? '').trim();
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(brut)) refuser(`Chemin invalide : ${brut}`);
  const racine = realpathSync(resolve(racineEspace));
  let rel = brut.replace(/\\/g, '/');
  if (isAbsolute(rel) || /^[a-z]:/i.test(rel) || rel.startsWith('/')) {
    const abs = resolve(rel);
    const ancre = existsSync(abs) ? realpathSync(abs) : abs;
    const racineBrute = resolve(racineEspace);
    if (estDans(racine, ancre)) rel = oblique(relative(racine, ancre));
    else if (estDans(racineBrute, abs)) rel = oblique(relative(racineBrute, abs));
    else refuser(`Chemin hors de l'espace refusé : ${brut} (chemin relatif à l'espace attendu)`);
  }
  const segments = rel.split('/').filter((s) => s !== '' && s !== '.');
  verifierSegments(segments, brut);
  const cible = resolve(racine, ...segments);

  // Dossier existant le plus proche : une fois les liens résolus, il doit rester dans l'espace.
  let ancre = cible;
  while (!existsSync(ancre)) ancre = dirname(ancre);
  const reel = realpathSync(ancre);
  if (!estDans(racine, reel)) refuser(`Accès refusé : ${brut} (sort de l'espace)`);
  const relReel = oblique(relative(racine, reel));
  if (relReel && DOSSIERS_INTERDITS.has(relReel.split('/')[0].toLowerCase())) refuser(`Accès refusé : ${brut}`);
  const existe = ancre === cible;
  return { absolu: existe ? reel : cible, relatif: segments.join('/'), existe };
}

export interface Entree {
  chemin: string;
  type: 'fichier' | 'dossier';
  taille?: number;
  modifie_le: string;
}

/** Contenu d'un dossier de l'espace, sur `profondeur` niveaux (1 = le dossier seul, 4 au plus). */
export function listerEspace(racineEspace: string, dossier = '.', profondeur = 1): { dossier: string; entrees: Entree[]; tronque: boolean } {
  const p = Math.min(Math.max(Math.trunc(profondeur) || 1, 1), 4);
  const c = cheminDansEspace(racineEspace, dossier || '.');
  if (!c.existe) refuser(`Dossier introuvable : ${c.relatif || '.'}`);
  if (!statSync(c.absolu).isDirectory()) refuser(`Pas un dossier : ${c.relatif}`);
  const racine = realpathSync(resolve(racineEspace));
  const entrees: Entree[] = [];
  let tronque = false;
  const parcourir = (abs: string, niveau: number) => {
    const liste = readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const ent of liste) {
      if (ent.name.startsWith('.')) continue;
      const enfant = join(abs, ent.name);
      const rel = oblique(relative(racine, enfant));
      if (DOSSIERS_INTERDITS.has(rel.split('/')[0].toLowerCase())) continue;
      if (entrees.length >= ENTREES_MAX) {
        tronque = true;
        return;
      }
      let st;
      try {
        st = statSync(enfant);
        if (!estDans(racine, realpathSync(enfant))) continue;
      } catch {
        continue;
      }
      const modifie_le = st.mtime.toISOString().replace(/\.\d{3}Z$/, 'Z');
      if (st.isDirectory()) {
        entrees.push({ chemin: `${rel}/`, type: 'dossier', modifie_le });
        if (niveau < p) parcourir(enfant, niveau + 1);
      } else if (st.isFile()) {
        entrees.push({ chemin: rel, type: 'fichier', taille: st.size, modifie_le });
      }
    }
  };
  parcourir(c.absolu, 1);
  return { dossier: c.relatif || '.', entrees, tronque };
}

export type Lecture =
  | { genre: 'texte'; chemin: string; texte: string; taille: number }
  | { genre: 'binaire'; chemin: string; extension: string; donnees: Buffer; taille: number };

/** Lit un fichier de l'espace : texte (UTF-8) ou octets bruts pour le reste (PDF, images, Word…). */
export function lireEspace(racineEspace: string, chemin: string): Lecture {
  const c = cheminDansEspace(racineEspace, chemin);
  if (!c.existe) refuser(`Fichier introuvable : ${c.relatif}`);
  const st = statSync(c.absolu);
  if (st.isDirectory()) refuser(`${c.relatif} est un dossier : utiliser lister_fichiers`);
  const ext = extname(c.absolu).toLowerCase();
  if (EXTENSIONS_TEXTE.has(ext) || ext === '') {
    if (st.size > TAILLE_MAX_TEXTE) refuser(`Fichier trop gros pour être lu d'un coup : ${c.relatif} (${st.size} octets)`);
    return { genre: 'texte', chemin: c.relatif, texte: readFileSync(c.absolu, 'utf8').replace(/^﻿/, ''), taille: st.size };
  }
  if (st.size > TAILLE_MAX_BINAIRE) refuser(`Fichier trop gros : ${c.relatif} (${st.size} octets)`);
  return { genre: 'binaire', chemin: c.relatif, extension: ext, donnees: readFileSync(c.absolu), taille: st.size };
}

export interface ResultatEcriture {
  chemin: string;
  /** true si un fichier existait déjà à cet endroit (il a été remplacé). */
  existait: boolean;
  ancienne_taille: number | null;
  taille: number;
}

/** Crée ou remplace un fichier texte de l'espace (dossiers parents créés). `creerSeulement` refuse d'écraser. */
export function ecrireEspace(racineEspace: string, chemin: string, contenu: string, o: { creerSeulement?: boolean } = {}): ResultatEcriture {
  const c = cheminDansEspace(racineEspace, chemin);
  const ext = extname(c.absolu).toLowerCase();
  if (!EXTENSIONS_ECRITURE.includes(ext)) {
    refuser(`Extension non autorisée en écriture : ${ext || '(aucune)'} (autorisées : ${EXTENSIONS_ECRITURE.join(', ')})`);
  }
  if (Buffer.byteLength(contenu, 'utf8') > TAILLE_MAX_TEXTE) refuser('Contenu trop long');
  let ancienne: number | null = null;
  if (c.existe) {
    const st = statSync(c.absolu);
    if (!st.isFile()) refuser(`${c.relatif} n'est pas un fichier`);
    if (o.creerSeulement) refuser(`${c.relatif} existe déjà (creer_seulement) : choisir un autre nom (suffixe « V2 ») ou remplacer en connaissance de cause`);
    ancienne = st.size;
  } else {
    mkdirSync(dirname(c.absolu), { recursive: true });
  }
  writeFileSync(c.absolu, contenu, 'utf8');
  return { chemin: c.relatif, existait: c.existe, ancienne_taille: ancienne, taille: statSync(c.absolu).size };
}

/** Déplace ou renomme un fichier dans l'espace ; refuse d'écraser une destination existante. */
export function deplacerEspace(racineEspace: string, source: string, destination: string): { source: string; destination: string } {
  const s = cheminDansEspace(racineEspace, source);
  if (!s.existe) refuser(`Fichier introuvable : ${s.relatif}`);
  if (!statSync(s.absolu).isFile()) refuser(`Seuls les fichiers se déplacent : ${s.relatif}`);
  const d = cheminDansEspace(racineEspace, destination);
  if (d.existe) refuser(`La destination existe déjà : ${d.relatif} (rien n'est écrasé)`);
  mkdirSync(dirname(d.absolu), { recursive: true });
  renameSync(s.absolu, d.absolu);
  return { source: s.relatif, destination: d.relatif };
}
