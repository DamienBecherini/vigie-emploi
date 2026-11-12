// Quel exécutable Node lancer pour un processus séparé (tableau de bord détaché, serveur MCP d'un autre client).
// Sous Claude Desktop, une extension tourne dans le Node intégré à l'application (processus « utilitaire » d'Electron) :
// process.execPath y désigne alors claude.exe, qui ouvrirait l'application au lieu d'exécuter un script.
// On n'utilise donc process.execPath que s'il s'agit vraiment de node ; sinon, le node du système (PATH).
import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';

/** Version minimale de Node : node:sqlite sans option (22.13), et engines de package.json (24). */
export const NODE_MINIMUM = { majeure: 24, mineure: 0 };

export function versionSuffisante(version: string): boolean {
  const m = version.trim().replace(/^v/, '').match(/^(\d+)\.(\d+)/);
  if (!m) return false;
  const [majeure, mineure] = [Number(m[1]), Number(m[2])];
  return majeure > NODE_MINIMUM.majeure || (majeure === NODE_MINIMUM.majeure && mineure >= NODE_MINIMUM.mineure);
}

/** true si l'exécutable courant est un vrai node (et pas une application Electron qui embarque Node). */
export function estNodeAutonome(execPath: string = process.execPath, versions: NodeJS.ProcessVersions = process.versions): boolean {
  return !('electron' in versions) && /^node(\.exe)?$/i.test(basename(execPath));
}

/** Commande « node » à écrire dans la configuration d'un autre client MCP : le chemin du node courant, sinon « node ». */
export function commandeNode(execPath: string = process.execPath, versions: NodeJS.ProcessVersions = process.versions): string {
  return estNodeAutonome(execPath, versions) ? execPath : 'node';
}

/** Version du node du PATH (« v24.12.0 »), ou null s'il est absent. */
function versionDuPath(): string | null {
  const r = spawnSync('node', ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 10_000 });
  return r.status === 0 ? r.stdout.trim() : null;
}

/**
 * Exécutable Node capable de faire tourner l'application dans un processus séparé : le node courant s'il en est un,
 * sinon le node du système s'il est assez récent, sinon null.
 */
export function nodeExecutable(
  o: { execPath?: string; versions?: NodeJS.ProcessVersions; versionPath?: () => string | null } = {},
): string | null {
  const execPath = o.execPath ?? process.execPath;
  const versions = o.versions ?? process.versions;
  if (estNodeAutonome(execPath, versions)) return execPath;
  const v = (o.versionPath ?? versionDuPath)();
  return v && versionSuffisante(v) ? 'node' : null;
}
