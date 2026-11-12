// Création d'un espace de travail : copie du modèle (modele/), du gabarit de CV et de la grille d'exemple,
// configuration de l'application et du serveur MCP, puis prompt de démarrage à donner à l'IA.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NOM_FICHIER_CONFIG, RACINE_APP } from '../core/config.ts';
import { EXEMPLE_GRILLE } from '../core/grille-stockage.ts';
import { GABARIT_DEFAUT, trouverNavigateur } from '../cv/cv.ts';

export const MODELE = join(RACINE_APP, 'modele');
export const BINAIRE = join(RACINE_APP, 'bin', 'postuler-juste.js');

export interface OptionsInit {
  dossier: string;
  port?: number;
  /** Nom du serveur MCP dans .mcp.json. */
  nomMcp?: string;
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

export function inviteDemarrage(espace: string): string {
  return (
    `Tu vas m'aider dans ma recherche d'emploi. Mon espace de travail est ${espace}. ` +
    `Lis ${espace}/AGENTS.md puis ${espace}/DEMARRAGE.md, et suis le démarrage : ` +
    `vérifie d'abord de quels outils tu disposes, lis ce que j'ai déposé dans a-deposer/, ` +
    `puis pose-moi tes questions, quelques-unes à la fois.`
  );
}

export function initialiserEspace(o: OptionsInit): ResultatInit {
  if (!o.dossier) erreurUtilisateur('Dossier à créer attendu : postuler-juste init <dossier>');
  const dossier = resolve(o.dossier);
  if (existsSync(dossier)) {
    if (!statSync(dossier).isDirectory()) erreurUtilisateur(`${dossier} existe et n'est pas un dossier`);
    if (readdirSync(dossier).length) erreurUtilisateur(`Le dossier ${dossier} n'est pas vide : choisir un dossier neuf ou vide`);
  }
  const port = o.port ?? 4410;
  const nomMcp = o.nomMcp ?? 'postuler-juste';
  if (!/^[\w-]+$/.test(nomMcp)) erreurUtilisateur(`Nom de serveur MCP invalide : ${nomMcp} (lettres, chiffres, - et _)`);

  const espace = oblique(dossier);
  const app = oblique(RACINE_APP);
  const commande = `node "${oblique(BINAIRE)}"`;

  cpSync(MODELE, dossier, { recursive: true });
  cpSync(GABARIT_DEFAUT, join(dossier, 'cv', 'gabarit'), { recursive: true });
  mkdirSync(join(dossier, 'profil'), { recursive: true });
  cpSync(EXEMPLE_GRILLE, join(dossier, 'profil', 'grille.json'));
  mkdirSync(join(dossier, 'data'), { recursive: true });
  personnaliser(dossier, { ESPACE: espace, APP: app, CMD: commande });

  const config = join(dossier, NOM_FICHIER_CONFIG);
  writeFileSync(config, `${JSON.stringify({ dossierDonnees: '.', port }, null, 2)}\n`, 'utf8');

  const mcp = join(dossier, '.mcp.json');
  const serveur = { command: process.execPath, args: [BINAIRE, 'mcp'], env: { POSTULER_JUSTE_DATA: dossier } };
  writeFileSync(mcp, `${JSON.stringify({ mcpServers: { [nomMcp]: serveur } }, null, 2)}\n`, 'utf8');

  const avertissements: string[] = [];
  if (!existsSync(join(RACINE_APP, 'dist', 'ui', 'index.html'))) {
    avertissements.push(`Tableau de bord non compilé : lancer « npm run build » dans ${app} avant « postuler-juste serve ».`);
  }
  const navigateur = trouverNavigateur(o.env);
  if (!navigateur) {
    avertissements.push(
      'Aucun Chrome, Edge ou Chromium trouvé : la génération des CV en PDF ne marchera pas. ' +
        'Installer Chrome ou Edge, ou indiquer le chemin du navigateur dans POSTULER_JUSTE_NAVIGATEUR.',
    );
  }

  return {
    ok: true,
    dossier: espace,
    commande,
    config: oblique(config),
    mcp: oblique(mcp),
    nom_mcp: nomMcp,
    port,
    navigateur,
    avertissements,
    invite: inviteDemarrage(espace),
  };
}
