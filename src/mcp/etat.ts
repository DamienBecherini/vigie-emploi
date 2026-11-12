// Espace de travail du serveur MCP : dossier de données, base ouverte ou non.
// Le serveur démarre toujours, même sans espace (cas d'un client comme Claude Desktop lancé sans configuration) :
// les outils de données répondent alors « espace non initialisé » jusqu'à l'appel d'initialiser_espace.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { chargerConfig, RACINE_APP, type Config, type OptionsConfig } from '../core/config.ts';
import { ouvrirBase, type Base } from '../db/base.ts';

/** Dossier de données quand rien n'est configuré (ni --data, ni POSTULER_JUSTE_DATA, ni fichier de config). */
export function dossierParDefaut(): string {
  return join(homedir(), 'ma-recherche');
}

export interface EtatMcp {
  config: Config;
  /** Base ouverte, ou null tant que l'espace n'existe pas. */
  db: Base | null;
  /** true si le dossier est le dossier par défaut, faute de configuration. */
  parDefaut: boolean;
  options: OptionsConfig;
}

const oblique = (p: string) => p.replace(/\\/g, '/');

/** Un espace est utilisable s'il existe et n'est pas vide (les anciens dossiers de données n'ont pas tous AGENTS.md). */
export function espaceExiste(dossier: string): boolean {
  return existsSync(dossier) && statSync(dossier).isDirectory() && readdirSync(dossier).length > 0;
}

/** Le dossier de l'application n'est jamais un espace de travail (cas d'un dépôt cloné à l'emplacement par défaut). */
function estApplication(dossier: string): boolean {
  return resolve(dossier).toLowerCase() === resolve(RACINE_APP).toLowerCase();
}

export function ouvrirEtat(options: OptionsConfig = {}): EtatMcp {
  let config: Config;
  let parDefaut = false;
  try {
    config = chargerConfig(options);
  } catch (e) {
    if (!/non configuré/.test((e as Error).message)) throw e;
    config = chargerConfig({ ...options, dossierDonnees: dossierParDefaut() });
    parDefaut = true;
  }
  const pret = espaceExiste(config.dossierDonnees) && !estApplication(config.dossierDonnees);
  return { config, db: pret ? ouvrirBase(config.base) : null, parDefaut, options };
}

export function messageNonInitialise(etat: EtatMcp): string {
  const d = oblique(etat.config.dossierDonnees);
  if (estApplication(etat.config.dossierDonnees)) {
    return `Le dossier ${d} est celui de l'application, pas un espace de travail : appelez initialiser_espace avec un autre dossier.`;
  }
  return (
    `Espace non initialisé : ${d} n'existe pas ou est vide. Appelez initialiser_espace (dossier ${d} par défaut, ` +
    "ou celui que l'utilisateur choisit), puis reprenez."
  );
}

/** Bascule le serveur sur un espace (après initialiser_espace) : relit sa configuration et ouvre sa base. */
export function basculer(etat: EtatMcp, dossier: string): void {
  const config = chargerConfig({ ...etat.options, dossierDonnees: dossier, cwd: dossier, fichierConfig: undefined });
  const db = ouvrirBase(config.base);
  etat.db?.close();
  etat.config = config;
  etat.db = db;
}
