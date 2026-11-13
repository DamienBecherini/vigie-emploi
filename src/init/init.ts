// Création d'un espace de travail : copie du modèle (modele/), du gabarit de CV et de la grille d'exemple,
// configuration de l'application et du serveur MCP, puis prompt de démarrage à donner à l'IA.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NOM_FICHIER_CONFIG, RACINE_APP } from '../core/config.ts';
import { exempleGrille } from '../core/grille-stockage.ts';
import { commandeNode } from '../core/node.ts';
import { DOSSIER_GABARITS, GABARIT_DEFAUT, listerGabarits, trouverNavigateur } from '../cv/cv.ts';
import { estLangue, LANGUE_DEFAUT, LANGUES, tl, type Langue } from '../i18n/index.ts';

export const MODELE = join(RACINE_APP, 'modele');

/**
 * Modèle de l'espace dans la langue voulue : modele-<langue>/ s'il existe (consignes de l'IA traduites,
 * à venir pour l'anglais), sinon modele/ (français).
 */
export function modeleDeLangue(langue: Langue, racine: string = RACINE_APP): string {
  if (langue === 'fr') return join(racine, 'modele');
  const traduit = join(racine, `modele-${langue}`);
  return existsSync(traduit) ? traduit : join(racine, 'modele');
}
export const BINAIRE = join(RACINE_APP, 'bin', 'vigie-emploi.js');
/** Consignes de l'application pour l'agent (AGENTS.md à la racine de l'application). */
export const CONSIGNES_APP = join(RACINE_APP, 'AGENTS.md');

/** Nom des consignes de l'application dans une langue : AGENTS.<langue>.md s'il existe, sinon AGENTS.md (français). */
export function nomConsignesApp(langue: Langue, racine: string = RACINE_APP): string {
  if (langue === 'fr') return 'AGENTS.md';
  return existsSync(join(racine, `AGENTS.${langue}.md`)) ? `AGENTS.${langue}.md` : 'AGENTS.md';
}
const DEPOT_PUBLIC = 'https://github.com/DamienBecherini/vigie-emploi/blob/main/';
/** Où l'init copie les consignes de l'application quand celle-ci tourne depuis le cache de npx. */
export const COPIE_CONSIGNES = 'procedures/application.md';

/**
 * Comment l'espace de travail relance l'application (consignes de l'IA et serveur MCP).
 * - Depuis le dépôt ou une installation durable (npm i -g, node_modules d'un projet, extension Claude Desktop) :
 *   `node <chemin>/bin/vigie-emploi.js` ; dans le Node intégré de Claude Desktop, la commande MCP est « node » (celui du système).
 * - Depuis le cache de npx (`npx vigie-emploi init …`) : ce cache peut être purgé, le chemin ne vaut rien.
 *   On écrit `npx -y vigie-emploi@<version>` (version figée : la base et ses migrations restent cohérentes) ;
 *   sous Windows, le client MCP lance npx via `cmd /c` (npx y est un script .cmd).
 */
export interface Lancement {
  mode: 'chemin' | 'npx';
  /** Commande à taper dans un terminal ({{CMD}} des consignes). */
  commande: string;
  /** Application telle qu'affichée dans les consignes ({{APP}}). */
  app: string;
  /** Serveur MCP de .mcp.json (sans l'environnement). */
  mcp: { command: string; args: string[] };
}

export function lancement(
  racine: string = RACINE_APP,
  version: string = versionApp(racine),
  plateforme: NodeJS.Platform = process.platform,
  node: string = commandeNode(),
): Lancement {
  if (/[\\/]_npx[\\/]/.test(racine)) {
    const paquet = `vigie-emploi@${version}`;
    const args = ['-y', paquet, 'mcp'];
    return {
      mode: 'npx',
      commande: `npx -y ${paquet}`,
      app: `${paquet} (npm)`,
      mcp: plateforme === 'win32' ? { command: 'cmd', args: ['/c', 'npx', ...args] } : { command: 'npx', args },
    };
  }
  const binaire = join(racine, 'bin', 'vigie-emploi.js');
  return { mode: 'chemin', commande: `node "${oblique(binaire)}"`, app: oblique(racine), mcp: { command: node, args: [binaire, 'mcp'] } };
}

function versionApp(racine: string): string {
  return (JSON.parse(readFileSync(join(racine, 'package.json'), 'utf8')) as { version: string }).version;
}

export interface OptionsInit {
  dossier: string;
  port?: number;
  /** Nom du serveur MCP dans .mcp.json. */
  nomMcp?: string;
  /** Gabarit de CV livré à installer (défaut : sobre). */
  gabarit?: string;
  /** Langue de l'interface, de la CLI et du suivi, écrite dans la config (défaut : fr). */
  langue?: Langue;
  env?: NodeJS.ProcessEnv;
}

export interface ResultatInit {
  ok: true;
  dossier: string;
  commande: string;
  config: string;
  mcp: string;
  nom_mcp: string;
  port: number;
  langue: Langue;
  navigateur: string | null;
  avertissements: string[];
  invite: string;
}

/** Chemin avec des barres obliques (accepté partout, y compris sous Windows). */
const oblique = (p: string) => p.replace(/\\/g, '/');

function erreurUtilisateur(message: string): never {
  throw Object.assign(new Error(message), { utilisateur: true });
}

/** Remplace les marqueurs {{…}} des fichiers texte copiés depuis le modèle. */
function personnaliser(dossier: string, valeurs: Record<string, string>): void {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      personnaliser(chemin, valeurs);
    } else if (/\.(md|txt)$/i.test(nom)) {
      const texte = readFileSync(chemin, 'utf8');
      const nouveau = texte.replace(/\{\{(\w+)\}\}/g, (m, cle: string) => valeurs[cle] ?? m);
      if (nouveau !== texte) writeFileSync(chemin, nouveau, 'utf8');
    }
  }
}

/** Prompt de démarrage à coller dans l'IA (en anglais, il lui demande aussi de parler anglais). */
export function inviteDemarrage(espace: string, langue: Langue = LANGUE_DEFAUT): string {
  return tl(langue, 'init.invite', { espace });
}

export function initialiserEspace(o: OptionsInit): ResultatInit {
  const langue = o.langue ?? LANGUE_DEFAUT;
  if (!estLangue(langue)) erreurUtilisateur(tl(LANGUE_DEFAUT, 'init.langueInconnue', { langue: String(langue), langues: LANGUES.join(', ') }));
  const m = (cle: Parameters<typeof tl>[1], params?: Parameters<typeof tl>[2]) => tl(langue, cle, params);
  if (!o.dossier) erreurUtilisateur(m('init.dossierAttendu'));
  const dossier = resolve(o.dossier);
  if (existsSync(dossier)) {
    if (!statSync(dossier).isDirectory()) erreurUtilisateur(m('init.pasUnDossier', { dossier }));
    if (readdirSync(dossier).length) erreurUtilisateur(m('init.nonVide', { dossier }));
  }
  const port = o.port ?? 4410;
  const nomMcp = o.nomMcp ?? 'vigie-emploi';
  if (!/^[\w-]+$/.test(nomMcp)) erreurUtilisateur(m('init.nomMcpInvalide', { nom: nomMcp }));

  const gabarit = o.gabarit ? join(DOSSIER_GABARITS, o.gabarit) : GABARIT_DEFAUT;
  if (!existsSync(join(gabarit, 'gabarit.css'))) {
    erreurUtilisateur(m('init.gabaritInconnu', { gabarit: o.gabarit, liste: listerGabarits().map((g) => g.nom).join(', ') }));
  }
  const espace = oblique(dossier);
  const lance = lancement();
  const { commande, app } = lance;

  // Modèle traduit (modele-en/…) s'il existe ; sinon le modèle français, signalé par un avertissement.
  const modele = modeleDeLangue(langue);
  cpSync(modele, dossier, { recursive: true });
  // npm ne livre pas les .gitignore d'un paquet : le modèle le garde sous le nom « gitignore ».
  if (existsSync(join(dossier, 'gitignore'))) renameSync(join(dossier, 'gitignore'), join(dossier, '.gitignore'));
  // Consignes de l'application : lues sur place, sauf depuis le cache de npx (purgeable) où on en copie une version.
  // Version de la langue de l'espace (AGENTS.en.md…) s'il y en a une.
  const consignes = nomConsignesApp(langue);
  let docApp = `${oblique(RACINE_APP)}/${consignes}`;
  if (lance.mode === 'npx') {
    const texte = readFileSync(join(RACINE_APP, consignes), 'utf8').replace(/\]\((?!https?:|#)([^)]+)\)/g, `](${DEPOT_PUBLIC}$1)`);
    writeFileSync(join(dossier, COPIE_CONSIGNES), texte, 'utf8');
    docApp = `${espace}/${COPIE_CONSIGNES}`;
  }
  cpSync(gabarit, join(dossier, 'cv', 'gabarit'), { recursive: true });
  mkdirSync(join(dossier, 'profil'), { recursive: true });
  cpSync(exempleGrille(langue), join(dossier, 'profil', 'grille.json'));
  mkdirSync(join(dossier, 'data'), { recursive: true });
  personnaliser(dossier, { ESPACE: espace, APP: app, CMD: commande, DOC_APP: docApp });

  const config = join(dossier, NOM_FICHIER_CONFIG);
  writeFileSync(config, `${JSON.stringify({ dossierDonnees: '.', port, langue }, null, 2)}\n`, 'utf8');

  const mcp = join(dossier, '.mcp.json');
  const serveur = { ...lance.mcp, env: { VIGIE_EMPLOI_DATA: dossier } };
  writeFileSync(mcp, `${JSON.stringify({ mcpServers: { [nomMcp]: serveur } }, null, 2)}\n`, 'utf8');

  const avertissements: string[] = [];
  if (langue !== 'fr' && modele === MODELE) avertissements.push(m('init.modeleFrancais'));
  if (lance.mode === 'npx') avertissements.push(m('init.npx', { commande }));
  if (!existsSync(join(RACINE_APP, 'dist', 'ui', 'index.html'))) avertissements.push(m('init.nonCompile', { app }));
  const navigateur = trouverNavigateur(o.env);
  if (!navigateur) avertissements.push(m('init.sansNavigateur'));

  return {
    ok: true,
    dossier: espace,
    commande,
    config: oblique(config),
    mcp: oblique(mcp),
    nom_mcp: nomMcp,
    port,
    langue,
    navigateur,
    avertissements,
    invite: inviteDemarrage(espace, langue),
  };
}
