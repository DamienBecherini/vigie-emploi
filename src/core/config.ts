// Résolution de la configuration : dossier de données, port, listes d'exclusion.
// Le code ne contient aucune donnée personnelle : tout ce qui est propre à l'utilisateur
// vit dans son dossier de données ou dans un postuler-juste.config.json non versionné.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Config {
  /** Dossier de données de l'utilisateur (contient data/, emails/, candidatures/…). */
  dossierDonnees: string;
  /** Base SQLite : <dossierDonnees>/data/postuler-juste.sqlite par défaut. */
  base: string;
  /** Boîte de réception des .eml : <dossierDonnees>/emails par défaut. */
  emails: string;
  port: number;
  /** Récupération du JSON-LD public (Hellowork, Free-Work). */
  telechargerJsonLd: boolean;
  titresExclus: RegExp[];
  employeursRefuses: RegExp[];
  /**
   * Commande qui ouvre un terminal avec l'agent (boutons de l'interface) ; `{dossier}` et `{invite}` y sont
   * remplacés. null : Windows Terminal + Claude Code sous Windows, rien ailleurs.
   */
  terminal: string[] | null;
  /** Fichier de configuration lu, s'il y en a un. */
  fichier: string | null;
}

interface ConfigFichier {
  dossierDonnees?: string;
  base?: string;
  emails?: string;
  port?: number;
  telechargerJsonLd?: boolean;
  titresExclus?: string[];
  employeursRefuses?: string[];
  terminal?: string[];
}

export const RACINE_APP = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const NOM_FICHIER_CONFIG = 'postuler-juste.config.json';
/** Ancien nom de l'application (cap-emploi) : fichier de config, base et variables encore reconnus. */
export const ANCIEN_FICHIER_CONFIG = 'cap-emploi.config.json';
const ANCIENNE_BASE = 'cap-emploi.sqlite';

/** Variable d'environnement POSTULER_JUSTE_<nom>, ou son ancien nom CAP_EMPLOI_<nom>. */
export function variable(env: NodeJS.ProcessEnv, nom: string): string | undefined {
  return env[`POSTULER_JUSTE_${nom}`] || env[`CAP_EMPLOI_${nom}`] || undefined;
}

/** Le fichier de config de ce dossier, sous son nom actuel ou l'ancien. */
function configDuDossier(dossier: string): string[] {
  return [join(dossier, NOM_FICHIER_CONFIG), join(dossier, ANCIEN_FICHIER_CONFIG)];
}

function lireJson(chemin: string): ConfigFichier {
  const texte = readFileSync(chemin, 'utf8').replace(/^﻿/, '');
  return JSON.parse(texte) as ConfigFichier;
}

function compiler(motifs: string[] | undefined): RegExp[] {
  return (motifs ?? []).map((m) => new RegExp(m, 'i'));
}

export interface OptionsConfig {
  /** Dossier de données imposé (option --data). */
  dossierDonnees?: string;
  /** Fichier de configuration imposé (option --config). */
  fichierConfig?: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}

/**
 * Ordre de priorité :
 * 1. option --data, sinon variable POSTULER_JUSTE_DATA, sinon "dossierDonnees" du fichier de config ;
 * 2. fichier de config : --config, POSTULER_JUSTE_CONFIG, ./postuler-juste.config.json, <data>/postuler-juste.config.json,
 *    puis celui à la racine de l'application.
 * Les anciens noms (CAP_EMPLOI_*, cap-emploi.config.json, data/cap-emploi.sqlite) restent reconnus.
 */
export function chargerConfig(opts: OptionsConfig = {}): Config {
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();
  const candidats: string[] = [];
  if (opts.fichierConfig) candidats.push(resolve(cwd, opts.fichierConfig));
  const configEnv = variable(env, 'CONFIG');
  if (configEnv) candidats.push(resolve(cwd, configEnv));
  candidats.push(...configDuDossier(cwd));
  const donneesImposees = opts.dossierDonnees ?? variable(env, 'DATA');
  if (donneesImposees) candidats.push(...configDuDossier(resolve(cwd, donneesImposees)));
  candidats.push(...configDuDossier(RACINE_APP));

  let fichier: string | null = null;
  let brut: ConfigFichier = {};
  if (opts.fichierConfig && !existsSync(candidats[0])) {
    throw new Error(`Fichier de configuration introuvable : ${candidats[0]}`);
  }
  for (const c of candidats) {
    if (existsSync(c)) {
      fichier = c;
      brut = lireJson(c);
      break;
    }
  }
  const baseRelative = fichier ? dirname(fichier) : cwd;
  const dossier = donneesImposees
    ? resolve(cwd, donneesImposees)
    : brut.dossierDonnees
      ? resolve(baseRelative, brut.dossierDonnees)
      : null;
  if (!dossier) {
    throw new Error(
      'Dossier de données non configuré : définir POSTULER_JUSTE_DATA, passer --data <dossier> ' +
        `ou créer ${NOM_FICHIER_CONFIG} avec "dossierDonnees" (voir postuler-juste.config.example.json).`,
    );
  }
  const relatif = (p: string | undefined, defaut: string) => (p ? (isAbsolute(p) ? p : join(dossier, p)) : defaut);
  // Base par défaut : data/postuler-juste.sqlite, ou l'ancienne data/cap-emploi.sqlite si elle seule existe.
  const baseNeuve = join(dossier, 'data', 'postuler-juste.sqlite');
  const baseAncienne = join(dossier, 'data', ANCIENNE_BASE);
  const baseDefaut = !existsSync(baseNeuve) && existsSync(baseAncienne) ? baseAncienne : baseNeuve;
  return {
    dossierDonnees: dossier,
    base: relatif(variable(env, 'BASE') ?? brut.base, baseDefaut),
    emails: relatif(brut.emails, join(dossier, 'emails')),
    port: Number(variable(env, 'PORT') ?? brut.port ?? 4410),
    telechargerJsonLd: brut.telechargerJsonLd ?? true,
    titresExclus: compiler(brut.titresExclus),
    employeursRefuses: compiler(brut.employeursRefuses),
    terminal: Array.isArray(brut.terminal) && brut.terminal.length ? brut.terminal.map(String) : null,
    fichier,
  };
}
