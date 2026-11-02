// Fichiers du dossier de candidature : liste (nom, taille, date) et accès en lecture, strictement limité
// au dossier de données (aucune traversée de chemin, pas de fichiers cachés, pas de base ni de boîte de réception).
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Base } from '../db/base.ts';
import { candidatureDe } from './offres.ts';
import { cheminRelatif } from './evenements.ts';

export interface FichierDossier {
  /** Chemin relatif au dossier de données (barres obliques) : celui à mettre dans un événement. */
  chemin: string;
  /** Chemin relatif au dossier de candidature. */
  nom: string;
  taille: number;
  modifie_le: string;
}

export interface FichiersDossier {
  offre_id: number;
  /** Dossier de candidature (relatif au dossier de données), ou null si la candidature n'en a pas. */
  dossier: string | null;
  existe: boolean;
  fichiers: FichierDossier[];
  /** true si la liste a été coupée (trop de fichiers). */
  tronque: boolean;
}

/** Dossiers de premier niveau jamais servis : la base et la boîte de réception. */
const DOSSIERS_INTERDITS = new Set(['data', 'emails']);
const PROFONDEUR_MAX = 4;
const FICHIERS_MAX = 500;

/**
 * Chemin absolu d'un fichier du dossier de données, après vérification : chemin relatif sans « .. » ni
 * segment caché, hors data/ et emails/, et qui reste dans le dossier une fois les liens symboliques résolus.
 * Lève une erreur sinon (ou si le fichier n'existe pas).
 */
export function fichierSur(dossierDonnees: string, chemin: string): { absolu: string; relatif: string } {
  const rel = cheminRelatif(chemin);
  if (DOSSIERS_INTERDITS.has(rel.split('/')[0].toLowerCase())) throw new Error(`Accès refusé : ${chemin}`);
  const racine = realpathSync(resolve(dossierDonnees));
  const cible = resolve(racine, ...rel.split('/'));
  if (!existsSync(cible)) throw new Error(`Fichier introuvable : ${rel}`);
  const reel = realpathSync(cible);
  if (reel !== racine && !reel.startsWith(racine + sep)) throw new Error(`Accès refusé : ${chemin}`);
  if (!statSync(reel).isFile()) throw new Error(`Pas un fichier : ${rel}`);
  return { absolu: reel, relatif: rel };
}

/** Fichiers (récursivement, sans les fichiers et dossiers cachés) d'un dossier relatif au dossier de données. */
export function listerFichiers(dossierDonnees: string, dossier: string): { existe: boolean; fichiers: FichierDossier[]; tronque: boolean } {
  const rel = cheminRelatif(dossier);
  const racine = realpathSync(resolve(dossierDonnees));
  const base = resolve(racine, ...rel.split('/'));
  if (!existsSync(base) || !statSync(base).isDirectory()) return { existe: false, fichiers: [], tronque: false };
  const reelBase = realpathSync(base);
  if (!reelBase.startsWith(racine + sep)) throw new Error(`Accès refusé : ${dossier}`);
  const fichiers: FichierDossier[] = [];
  let tronque = false;
  const parcourir = (dir: string, profondeur: number) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith('.')) continue;
      const abs = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (profondeur < PROFONDEUR_MAX) parcourir(abs, profondeur + 1);
        continue;
      }
      if (!ent.isFile()) continue;
      if (fichiers.length >= FICHIERS_MAX) {
        tronque = true;
        return;
      }
      const st = statSync(abs);
      fichiers.push({
        chemin: relative(racine, abs).split(sep).join('/'),
        nom: relative(reelBase, abs).split(sep).join('/'),
        taille: st.size,
        modifie_le: st.mtime.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      });
    }
  };
  parcourir(reelBase, 1);
  // La fiche du dossier d'abord, puis du plus récent au plus ancien.
  fichiers.sort((a, b) =>
    a.nom === 'dossier-candidature.md' ? -1 : b.nom === 'dossier-candidature.md' ? 1 : b.modifie_le.localeCompare(a.modifie_le) || a.nom.localeCompare(b.nom),
  );
  return { existe: true, fichiers, tronque };
}

/** Fichiers du dossier de candidature d'une offre (liste vide si la candidature n'a pas de dossier). */
export function fichiersDossier(db: Base, dossierDonnees: string, offreId: number): FichiersDossier {
  const dossier = candidatureDe(db, offreId)?.dossier ?? null;
  if (!dossier) return { offre_id: offreId, dossier: null, existe: false, fichiers: [], tronque: false };
  return { offre_id: offreId, dossier, ...listerFichiers(dossierDonnees, dossier) };
}
