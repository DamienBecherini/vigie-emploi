// Résolution de la configuration : dossier de données, port, listes d'exclusion.
// Le code ne contient aucune donnée personnelle : tout ce qui est propre à l'utilisateur
// vit dans son dossier de données ou dans un postuler-juste.config.json non versionné.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { estLangue, LANGUE_DEFAUT, LANGUES, type Langue } from '../i18n/outil.ts';
import { tl } from '../i18n/index.ts';

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
  /** Langue de l'interface, de la CLI et du suivi généré (« fr » par défaut, ou « en »). */
  langue: Langue;
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
  langue?: string;
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

/**
 * Erreur de configuration reconnaissable par son code (et non par le texte du message, qui dépend de la langue).
 * - `non-configure` : aucun dossier de données (le serveur MCP se rabat alors sur le dossier par défaut) ;
 * - `fichier-introuvable` : fichier de configuration imposé absent ;
 * - `langue-inconnue` : valeur de langue refusée.
 */
export class ErreurConfig extends Error {
  readonly code: 'non-configure' | 'fichier-introuvable' | 'langue-inconnue';
  constructor(code: ErreurConfig['code'], message: string) {
    super(message);
    this.name = 'ErreurConfig';
    this.code = code;
  }
}

/** Langue des messages d'erreur de configuration : variable, sinon fichier, si elles sont valides ; sinon le français. */
function langueDesMessages(env: NodeJS.ProcessEnv, brut: ConfigFichier = {}): Langue {
  const v = variable(env, 'LANGUE');
  if (estLangue(v)) return v;
  return estLangue(brut.langue) ? brut.langue : LANGUE_DEFAUT;
}

/** Langue de la variable POSTULER_JUSTE_LANGUE, sinon du fichier, sinon le français ; une valeur inconnue est refusée. */
function langueDe(env: NodeJS.ProcessEnv, brut: ConfigFichier, fichier: string | null): Langue {
  const v = variable(env, 'LANGUE') ?? brut.langue ?? LANGUE_DEFAUT;
  if (!estLangue(v)) {
    const langue = langueDesMessages(env, brut);
    throw new ErreurConfig(
      'langue-inconnue',
      tl(langue, 'core.config.langue', { langue: v, langues: LANGUES.join(tl(langue, 'core.ou')), fichier: fichier ?? NOM_FICHIER_CONFIG }),
    );
  }
  return v;
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
    throw new ErreurConfig('fichier-introuvable', tl(langueDesMessages(env), 'core.config.introuvable', { chemin: candidats[0] }));
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
    throw new ErreurConfig('non-configure', tl(langueDesMessages(env, brut), 'core.config.nonConfigure', { fichier: NOM_FICHIER_CONFIG }));
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
    langue: langueDe(env, brut, fichier),
    fichier,
  };
}

/**
 * Langue configurée, sans jamais échouer (aide et erreurs de la CLI) : celle de la configuration si elle se charge,
 * sinon celle de POSTULER_JUSTE_LANGUE si elle est valide, sinon le français.
 */
export function langueConfiguree(opts: OptionsConfig = {}): Langue {
  try {
    return chargerConfig(opts).langue;
  } catch {
    const v = variable(opts.env ?? process.env, 'LANGUE');
    return estLangue(v) ? v : LANGUE_DEFAUT;
  }
}
