// Résolution de la configuration : dossier de données, port, listes d'exclusion.
// Le code ne contient aucune donnée personnelle : tout ce qui est propre à l'utilisateur
// vit dans son dossier de données ou dans un vigie-emploi.config.json non versionné.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { estLangue, LANGUE_DEFAUT, LANGUES, type Langue } from '../i18n/outil.ts';
import { tl } from '../i18n/index.ts';

export interface Config {
  /** Dossier de données de l'utilisateur (contient data/, emails/, candidatures/…). */
  dossierDonnees: string;
  /** Base SQLite : <dossierDonnees>/data/vigie-emploi.sqlite par défaut. */
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
export const NOM_FICHIER_CONFIG = 'vigie-emploi.config.json';
/** Anciens noms de l'application (postuler-juste, puis cap-emploi avant lui) : fichiers de config, bases et variables encore reconnus. */
export const ANCIENS_NOMS = ['postuler-juste', 'cap-emploi'] as const;
export const ANCIENS_FICHIERS_CONFIG = ANCIENS_NOMS.map((n) => `${n}.config.json`);
const PREFIXES_VARIABLES = ['VIGIE_EMPLOI_', 'POSTULER_JUSTE_', 'CAP_EMPLOI_'];

/**
 * Variable d'environnement VIGIE_EMPLOI_<nom>, ou ses anciens noms POSTULER_JUSTE_<nom> et CAP_EMPLOI_<nom>.
 * Une valeur vide, ou restée sous la forme `${…}` (réglage d'une extension Claude Desktop laissé vide, non substitué),
 * compte comme absente.
 */
export function variable(env: NodeJS.ProcessEnv, nom: string): string | undefined {
  const utile = (v: string | undefined) => {
    const t = v?.trim();
    return t && !/^\$\{[^}]*\}$/.test(t) ? t : undefined;
  };
  for (const prefixe of PREFIXES_VARIABLES) {
    const v = utile(env[`${prefixe}${nom}`]);
    if (v) return v;
  }
  return undefined;
}

/** Noms de langue saisis à la main (réglage de l'extension Claude Desktop) ramenés au code : « English » → en. */
const ALIAS_LANGUE: Record<string, string> = { francais: 'fr', français: 'fr', french: 'fr', anglais: 'en', english: 'en' };

/** Code de langue d'une valeur saisie (casse et alias tolérés) ; la valeur en minuscules si elle n'est pas reconnue. */
export function normaliserLangue(v: string): string {
  const b = v.trim().toLowerCase();
  return ALIAS_LANGUE[b] ?? b;
}

/** Le fichier de config de ce dossier, sous son nom actuel ou l'ancien. */
function configDuDossier(dossier: string): string[] {
  return [NOM_FICHIER_CONFIG, ...ANCIENS_FICHIERS_CONFIG].map((f) => join(dossier, f));
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
  const n = v === undefined ? undefined : normaliserLangue(v);
  if (estLangue(n)) return n;
  return estLangue(brut.langue) ? brut.langue : LANGUE_DEFAUT;
}

/** Langue de la variable VIGIE_EMPLOI_LANGUE, sinon du fichier, sinon le français ; une valeur inconnue est refusée. */
function langueDe(env: NodeJS.ProcessEnv, brut: ConfigFichier, fichier: string | null): Langue {
  const saisie = variable(env, 'LANGUE');
  const v = (saisie === undefined ? undefined : normaliserLangue(saisie)) ?? brut.langue ?? LANGUE_DEFAUT;
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
 * 1. option --data, sinon variable VIGIE_EMPLOI_DATA, sinon "dossierDonnees" du fichier de config ;
 * 2. fichier de config : --config, VIGIE_EMPLOI_CONFIG, ./vigie-emploi.config.json, <data>/vigie-emploi.config.json,
 *    puis celui à la racine de l'application.
 * Les anciens noms (POSTULER_JUSTE_* et CAP_EMPLOI_*, postuler-juste.config.json et cap-emploi.config.json, leurs bases
 * data/postuler-juste.sqlite et data/cap-emploi.sqlite) restent reconnus.
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
  // Base par défaut : data/vigie-emploi.sqlite, ou la première ancienne base existante (postuler-juste, cap-emploi)
  // tant que la nouvelle n'existe pas.
  const baseNeuve = join(dossier, 'data', 'vigie-emploi.sqlite');
  const baseAncienne = ANCIENS_NOMS.map((n) => join(dossier, 'data', `${n}.sqlite`)).find((b) => existsSync(b));
  const baseDefaut = !existsSync(baseNeuve) && baseAncienne ? baseAncienne : baseNeuve;
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
 * sinon celle de VIGIE_EMPLOI_LANGUE si elle est valide, sinon le français.
 */
export function langueConfiguree(opts: OptionsConfig = {}): Langue {
  try {
    return chargerConfig(opts).langue;
  } catch {
    const v = variable(opts.env ?? process.env, 'LANGUE');
    const n = v === undefined ? undefined : normaliserLangue(v);
    return estLangue(n) ? n : LANGUE_DEFAUT;
  }
}
