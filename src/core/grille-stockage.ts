// Grille de notation : fichier <données>/profil/grille.json (version courante), versions en base (table grilles),
// renotation en masse et aperçu de l'impact d'un changement.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Base } from '../db/base.ts';
import { transaction } from '../db/base.ts';
import { RACINE_APP } from './config.ts';
import type { Langue } from '../i18n/outil.ts';
import {
  appliquerChangement,
  calculerNote,
  exemplesCalcules,
  META_FICHIER,
  resumeRegles,
  schemaSaisie,
  validerGrille,
  type Decomposition,
  type ExempleCalcule,
  type Grille,
} from './grille.ts';
import { recalculer } from './offres.ts';
import { maintenant } from './texte.ts';

export const AUTEURS_GRILLE = ['interface', 'cli', 'mcp', 'fichier'] as const;
export type AuteurGrille = (typeof AUTEURS_GRILLE)[number];

export interface InfoVersion {
  version: number;
  le: string;
  auteur: AuteurGrille;
  resume: string;
}

export interface VersionGrille extends InfoVersion {
  grille: Grille;
}

export const EXEMPLE_GRILLE = join(RACINE_APP, 'exemples', 'grille.json');

/** Grille d'exemple de la langue : exemples/grille.<langue>.json s'il existe (anglais : phase de traduction à venir), sinon la française. */
export function exempleGrille(langue: Langue = 'fr'): string {
  if (langue === 'fr') return EXEMPLE_GRILLE;
  const traduite = join(RACINE_APP, 'exemples', `grille.${langue}.json`);
  return existsSync(traduite) ? traduite : EXEMPLE_GRILLE;
}

export function cheminGrille(dossierDonnees: string): string {
  return join(dossierDonnees, 'profil', 'grille.json');
}

/** Forme canonique (pour comparer deux grilles sans tenir compte de la mise en page). */
function canonique(g: Grille): string {
  return JSON.stringify(g);
}

/** Lit et valide grille.json ; null s'il n'existe pas. Les métadonnées (version, resume…) sont séparées. */
export function lireFichierGrille(chemin: string): { grille: Grille; resume: string | null; version: number | null } | null {
  if (!existsSync(chemin)) return null;
  let brut: Record<string, unknown>;
  try {
    brut = JSON.parse(readFileSync(chemin, 'utf8').replace(/^﻿/, '')) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`Grille illisible (${chemin}) : ${(e as Error).message}`);
  }
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) throw new Error(`Grille illisible (${chemin}) : objet JSON attendu`);
  const contenu = { ...brut };
  for (const k of META_FICHIER) delete contenu[k];
  return {
    grille: validerGrille(contenu, chemin),
    resume: typeof brut.resume === 'string' ? brut.resume : null,
    version: typeof brut.version === 'number' ? brut.version : null,
  };
}

/** Écrit grille.json (version courante, avec ses métadonnées en tête), de façon atomique. */
export function ecrireFichierGrille(chemin: string, v: VersionGrille): void {
  mkdirSync(dirname(chemin), { recursive: true });
  const tmp = `${chemin}.tmp`;
  const corps = { version: v.version, modifiee_le: v.le, resume: v.resume, ...v.grille };
  writeFileSync(tmp, `${JSON.stringify(corps, null, 2)}\n`, 'utf8');
  renameSync(tmp, chemin);
}

interface LigneGrille {
  version: number;
  contenu: string;
  le: string;
  auteur: AuteurGrille;
  resume: string;
}

function versionDeLigne(l: LigneGrille): VersionGrille {
  return { version: l.version, le: l.le, auteur: l.auteur, resume: l.resume, grille: validerGrille(JSON.parse(l.contenu), `version ${l.version}`) };
}

export function derniereVersion(db: Base): VersionGrille | null {
  const l = db.prepare('SELECT * FROM grilles ORDER BY version DESC LIMIT 1').get() as LigneGrille | undefined;
  return l ? versionDeLigne(l) : null;
}

export function versionGrille(db: Base, version: number): VersionGrille {
  const l = db.prepare('SELECT * FROM grilles WHERE version = ?').get(version) as LigneGrille | undefined;
  if (!l) throw new Error(`Version ${version} de la grille introuvable`);
  return versionDeLigne(l);
}

/** Historique des versions, de la plus récente à la plus ancienne. */
export function historiqueGrille(db: Base): InfoVersion[] {
  return db.prepare('SELECT version, le, auteur, resume FROM grilles ORDER BY version DESC').all() as unknown as InfoVersion[];
}

function insererVersion(db: Base, grille: Grille, auteur: AuteurGrille, resume: string): VersionGrille {
  const r = resume.trim();
  if (!r) throw new Error('Résumé du changement attendu');
  const precedente = (db.prepare('SELECT MAX(version) AS v FROM grilles').get() as { v: number | null }).v ?? 0;
  const v: VersionGrille = { version: precedente + 1, le: maintenant(), auteur, resume: r, grille };
  db.prepare('INSERT INTO grilles (version, contenu, le, auteur, resume) VALUES (?, ?, ?, ?, ?)').run(
    v.version,
    JSON.stringify(grille),
    v.le,
    auteur,
    v.resume,
  );
  return v;
}

/**
 * Grille courante, après synchronisation du fichier et de la base :
 * - fichier présent, base vide → version 1 (auteur « fichier ») ;
 * - fichier modifié à la main → nouvelle version (auteur « fichier »), notes recalculées ;
 * - fichier absent, base non vide → le fichier est réécrit depuis la dernière version.
 * null s'il n'y a de grille ni dans le fichier ni en base.
 */
export function grilleCourante(db: Base, dossierDonnees: string): VersionGrille | null {
  const chemin = cheminGrille(dossierDonnees);
  const fichier = lireFichierGrille(chemin);
  const base = derniereVersion(db);
  if (!fichier) {
    if (base) ecrireFichierGrille(chemin, base);
    return base;
  }
  if (base && canonique(base.grille) === canonique(fichier.grille)) {
    if (fichier.version !== base.version) ecrireFichierGrille(chemin, base);
    return base;
  }
  const resume = base ? 'Modifiée dans le fichier grille.json' : (fichier.resume ?? 'Version initiale (fichier grille.json)');
  const v = transaction(db, () => {
    const nv = insererVersion(db, fichier.grille, 'fichier', resume);
    renoterAvec(db, nv);
    return nv;
  });
  ecrireFichierGrille(chemin, v);
  return v;
}

/** Comme grilleCourante, mais lève une erreur claire s'il n'y a pas de grille. */
export function grilleObligatoire(db: Base, dossierDonnees: string): VersionGrille {
  const g = grilleCourante(db, dossierDonnees);
  if (!g) {
    throw new Error(
      `Pas de grille de notation : créer ${cheminGrille(dossierDonnees)} (modèle : exemples/grille.json, ou « postuler-juste grille --init »)`,
    );
  }
  return g;
}

/** Copie la grille d'exemple dans le dossier de données si aucune grille n'existe. */
export function initialiserGrille(db: Base, dossierDonnees: string, langue: Langue = 'fr'): { cree: boolean; chemin: string; version: VersionGrille } {
  const chemin = cheminGrille(dossierDonnees);
  const cree = !existsSync(chemin) && !derniereVersion(db);
  if (cree) {
    mkdirSync(dirname(chemin), { recursive: true });
    copyFileSync(exempleGrille(langue), chemin);
  }
  return { cree, chemin, version: grilleObligatoire(db, dossierDonnees) };
}

// ---------------------------------------------------------------------------------------------
// Renotation et aperçu

interface NoteACalculer {
  note_id: number;
  offre_id: number;
  titre: string;
  entreprise: string | null;
  note: number | null;
  saisie: string;
  teletravail: string | null;
  remuneration_min: number | null;
  remuneration_max: number | null;
  remuneration_unite: string | null;
}

/** Dernière note de chaque offre, quand elle a des sous-notes (les notes globales restent figées). */
function notesACalculer(db: Base): NoteACalculer[] {
  return db
    .prepare(
      `SELECT n.id AS note_id, o.id AS offre_id, o.titre, o.entreprise, n.note, n.saisie, o.teletravail,
              o.remuneration_min, o.remuneration_max, o.remuneration_unite
       FROM offres o
       JOIN notes n ON n.id = (SELECT id FROM notes WHERE offre_id = o.id ORDER BY notee_le DESC, id DESC LIMIT 1)
       WHERE n.saisie IS NOT NULL`,
    )
    .all() as unknown as NoteACalculer[];
}

export interface ChangementNote {
  id: number;
  titre: string;
  entreprise: string | null;
  avant: number | null;
  apres: number;
}

export interface Impact {
  /** Offres dont la dernière note a des sous-notes (celles qui sont recalculées). */
  offres_recalculees: number;
  /** Offres dont la note affichée change. */
  changees: number;
  seuil_avant: number | null;
  seuil_apres: number;
  /** Passent au-dessus du seuil (≥) / repassent en dessous. */
  montent: ChangementNote[];
  descendent: ChangementNote[];
  /** Les changements, du plus fort au plus faible (100 au plus). */
  changements: ChangementNote[];
}

function calculer(n: NoteACalculer, v: { grille: Grille; version: number | null }): Decomposition {
  const saisie = schemaSaisie.parse(JSON.parse(n.saisie));
  return calculerNote(v.grille, saisie, n, v.version);
}

function mesurer(lignes: { n: NoteACalculer; d: Decomposition }[], seuilAvant: number | null, seuilApres: number): Impact {
  const changements: ChangementNote[] = [];
  const montent: ChangementNote[] = [];
  const descendent: ChangementNote[] = [];
  for (const { n, d } of lignes) {
    if (n.note === d.note) continue;
    const c = { id: n.offre_id, titre: n.titre, entreprise: n.entreprise, avant: n.note, apres: d.note };
    changements.push(c);
  }
  for (const { n, d } of lignes) {
    const avant = n.note !== null && n.note >= (seuilAvant ?? seuilApres);
    const apres = d.note >= seuilApres;
    const c = { id: n.offre_id, titre: n.titre, entreprise: n.entreprise, avant: n.note, apres: d.note };
    if (!avant && apres) montent.push(c);
    if (avant && !apres) descendent.push(c);
  }
  changements.sort((a, b) => Math.abs(b.apres - (b.avant ?? 0)) - Math.abs(a.apres - (a.avant ?? 0)) || a.id - b.id);
  return {
    offres_recalculees: lignes.length,
    changees: changements.length,
    seuil_avant: seuilAvant,
    seuil_apres: seuilApres,
    montent,
    descendent,
    changements: changements.slice(0, 100),
  };
}

/** Ce que changerait une grille, sans rien écrire. */
export function apercuGrille(db: Base, grille: Grille, seuilAvant: number | null): Impact {
  const lignes = notesACalculer(db).map((n) => ({ n, d: calculer(n, { grille, version: null }) }));
  return mesurer(lignes, seuilAvant, grille.seuil);
}

/** Recalcule (sur place) la dernière note de chaque offre qui a des sous-notes. */
function renoterAvec(db: Base, v: VersionGrille, seuilAvant: number | null = null): Impact {
  const lignes = notesACalculer(db).map((n) => ({ n, d: calculer(n, v) }));
  const maj = db.prepare(
    `UPDATE notes SET note = ?, note_exacte = ?, note_brute = ?, penalites = ?, decomposition = ?, grille_version = ?, recalculee_le = ?
     WHERE id = ?`,
  );
  const le = maintenant();
  for (const { n, d } of lignes) {
    maj.run(d.note, d.note_exacte, d.moyenne, resumeRegles(d), JSON.stringify(d), String(v.version), le, n.note_id);
    if (n.note !== d.note) recalculer(db, n.offre_id);
  }
  return mesurer(lignes, seuilAvant ?? v.grille.seuil, v.grille.seuil);
}

/** Renotation en masse avec la grille courante. */
export function renoter(db: Base, dossierDonnees: string): { version: number; impact: Impact } {
  const v = grilleObligatoire(db, dossierDonnees);
  return { version: v.version, impact: transaction(db, () => renoterAvec(db, v)) };
}

/** Enregistre une nouvelle version (fichier + base), puis recalcule les notes. */
export function enregistrerGrille(
  db: Base,
  dossierDonnees: string,
  brut: unknown,
  o: { auteur: AuteurGrille; resume: string },
): { version: VersionGrille; impact: Impact } {
  const grille = validerGrille(brut);
  const avant = grilleCourante(db, dossierDonnees);
  if (avant && canonique(avant.grille) === canonique(grille)) throw new Error('Aucun changement par rapport à la version courante');
  const r = transaction(db, () => {
    const v = insererVersion(db, grille, o.auteur, o.resume);
    return { version: v, impact: renoterAvec(db, v, avant?.grille.seuil ?? null) };
  });
  ecrireFichierGrille(cheminGrille(dossierDonnees), r.version);
  return r;
}

/** Changement partiel (outil MCP, CLI) : essai = aperçu seul, sinon enregistrement. */
export function modifierGrille(
  db: Base,
  dossierDonnees: string,
  changement: unknown,
  o: { auteur: AuteurGrille; resume: string; essai?: boolean },
): { enregistree: boolean; version: number; grille: Grille; impact: Impact; exemples_calcules: ExempleCalcule[] } {
  const courante = grilleObligatoire(db, dossierDonnees);
  const grille = appliquerChangement(courante.grille, changement);
  const avant = { grille: courante.grille, version: courante.version };
  if (o.essai) {
    return {
      enregistree: false,
      version: courante.version,
      grille,
      impact: apercuGrille(db, grille, courante.grille.seuil),
      // Exemples de référence recalculés avec la grille d'essai : utiles même sur une base encore vide.
      exemples_calcules: exemplesCalcules(grille, null, avant),
    };
  }
  const r = enregistrerGrille(db, dossierDonnees, grille, o);
  return {
    enregistree: true,
    version: r.version.version,
    grille: r.version.grille,
    impact: r.impact,
    exemples_calcules: exemplesCalcules(r.version.grille, r.version.version, avant),
  };
}

/** Retour à une version précédente : son contenu devient une nouvelle version. */
export function restaurerGrille(
  db: Base,
  dossierDonnees: string,
  version: number,
  o: { auteur: AuteurGrille; resume?: string },
): { version: VersionGrille; impact: Impact } {
  const ancienne = versionGrille(db, version);
  return enregistrerGrille(db, dossierDonnees, ancienne.grille, { auteur: o.auteur, resume: o.resume?.trim() || `Retour à la version ${version}` });
}
