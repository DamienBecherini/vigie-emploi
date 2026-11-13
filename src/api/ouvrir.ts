// Ouverture d'un dossier de l'espace dans l'explorateur de fichiers du système, et détection du « poste local ».
//
// Une page web ne peut pas ouvrir un dossier local (les liens file:// sont bloqués depuis http://) : c'est donc le
// serveur qui lance l'explorateur. Il ne le fait que pour une requête venue de la machine où il tourne : ailleurs
// (téléphone, autre poste), l'explorateur s'ouvrirait sur l'écran de cette machine, pas sur celui de l'utilisateur.
import { spawn } from 'node:child_process';
import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

/** Ouvre un dossier (chemin absolu, déjà vérifié) dans l'explorateur de fichiers. */
export type OuvreurDossier = (absolu: string) => Promise<void>;

/** Programme qui ouvre un dossier dans l'explorateur, selon le système. */
export function programmeOuverture(plateforme: NodeJS.Platform = process.platform): string {
  if (plateforme === 'win32') return 'explorer.exe';
  if (plateforme === 'darwin') return 'open';
  return 'xdg-open';
}

export function ouvreurSysteme(plateforme: NodeJS.Platform = process.platform): OuvreurDossier {
  const programme = programmeOuverture(plateforme);
  return (absolu) =>
    new Promise((resolve, reject) => {
      // Détaché et sans attendre la fin : l'explorateur vit sa vie (explorer.exe rend d'ailleurs le code 1 même réussi).
      const p = spawn(programme, [absolu], { detached: true, stdio: 'ignore', windowsHide: false });
      p.once('error', (e) => reject(Object.assign(new Error(e.message), { programme })));
      p.once('spawn', () => {
        p.unref();
        resolve();
      });
    });
}

const ADRESSES_LOCALES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * La requête vient-elle de la machine où tourne le serveur ? D'après l'adresse de la connexion TCP (pas d'un en-tête,
 * qu'un client pourrait inventer). Faux si l'adresse est inconnue (requête de test sans connexion réelle).
 */
export function requeteLocale(c: Context): boolean {
  try {
    const adresse = getConnInfo(c).remote.address;
    return Boolean(adresse && (ADRESSES_LOCALES.has(adresse) || adresse.startsWith('127.')));
  } catch {
    return false;
  }
}
