// Résolution de la configuration : dossier de données, port, listes d'exclusion.
// Le code ne contient aucune donnée personnelle : tout ce qui est propre à l'utilisateur
// vit dans son dossier de données ou dans un cap-emploi.config.json non versionné.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Config {
  /** Dossier de données de l'utilisateur (contient data/, emails/, candidatures/…). */
  dossierDonnees: string;
  /** Base SQLite : <dossierDonnees>/data/cap-emploi.sqlite par défaut. */
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
export const NOM_FICHIER_CONFIG = 'cap-emploi.config.json';

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
 * 1. option --data, sinon variable CAP_EMPLOI_DATA, sinon "dossierDonnees" du fichier de config ;
 * 2. fichier de config : --config, CAP_EMPLOI_CONFIG, ./cap-emploi.config.json, <data>/cap-emploi.config.json,
 *    puis celui à la racine de l'application.
 */
export function chargerConfig(opts: OptionsConfig = {}): Config {
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();
  const candidats: string[] = [];
  if (opts.fichierConfig) candidats.push(resolve(cwd, opts.fichierConfig));
  if (env.CAP_EMPLOI_CONFIG) candidats.push(resolve(cwd, env.CAP_EMPLOI_CONFIG));
  candidats.push(join(cwd, NOM_FICHIER_CONFIG));
  const donneesImposees = opts.dossierDonnees ?? env.CAP_EMPLOI_DATA;
  if (donneesImposees) candidats.push(join(resolve(cwd, donneesImposees), NOM_FICHIER_CONFIG));
  candidats.push(join(RACINE_APP, NOM_FICHIER_CONFIG));

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
      'Dossier de données non configuré : définir CAP_EMPLOI_DATA, passer --data <dossier> ' +
        `ou créer ${NOM_FICHIER_CONFIG} avec "dossierDonnees" (voir cap-emploi.config.example.json).`,
    );
  }
  const relatif = (p: string | undefined, defaut: string) => (p ? (isAbsolute(p) ? p : join(dossier, p)) : defaut);
  return {
    dossierDonnees: dossier,
    base: relatif(env.CAP_EMPLOI_BASE ?? brut.base, join(dossier, 'data', 'cap-emploi.sqlite')),
    emails: relatif(brut.emails, join(dossier, 'emails')),
    port: Number(env.CAP_EMPLOI_PORT ?? brut.port ?? 4410),
    telechargerJsonLd: brut.telechargerJsonLd ?? true,
    titresExclus: compiler(brut.titresExclus),
    employeursRefuses: compiler(brut.employeursRefuses),
    terminal: Array.isArray(brut.terminal) && brut.terminal.length ? brut.terminal.map(String) : null,
    fichier,
  };
}
