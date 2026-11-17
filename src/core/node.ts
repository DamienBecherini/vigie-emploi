// Which Node executable to launch for a separate process (detached dashboard, MCP server of another client).
// In Claude Desktop, an extension runs in the Node built into the application (Electron "utility" process):
// process.execPath then points to claude.exe, which would open the application instead of running a script.
// So process.execPath is only used if it really is node; otherwise, the system's node (PATH).
import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';

/** Minimum Node version: node:sqlite without a flag (22.13), and the engines of package.json (24). */
export const NODE_MINIMUM = { major: 24, minor: 0 };

export function versionSufficient(version: string): boolean {
  const m = version.trim().replace(/^v/, '').match(/^(\d+)\.(\d+)/);
  if (!m) return false;
  const [major, minor] = [Number(m[1]), Number(m[2])];
  return major > NODE_MINIMUM.major || (major === NODE_MINIMUM.major && minor >= NODE_MINIMUM.minor);
}

/** true if the current executable is a real node (and not an Electron application that embeds Node). */
export function isNodeStandalone(execPath: string = process.execPath, versions: NodeJS.ProcessVersions = process.versions): boolean {
  return !('electron' in versions) && /^node(\.exe)?$/i.test(basename(execPath));
}

/** "node" command to write into the configuration of another MCP client: the path of the current node, otherwise "node". */
export function commandNode(execPath: string = process.execPath, versions: NodeJS.ProcessVersions = process.versions): string {
  return isNodeStandalone(execPath, versions) ? execPath : 'node';
}

/** Version of the node on the PATH ("v24.12.0"), or null if it is missing. */
function pathVersion(): string | null {
  const r = spawnSync('node', ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 10_000 });
  return r.status === 0 ? r.stdout.trim() : null;
}

/**
 * Node executable able to run the application in a separate process: the current node if it is one,
 * otherwise the system's node if it is recent enough, otherwise null.
 */
export function nodeExecutable(
  o: { execPath?: string; versions?: NodeJS.ProcessVersions; versionPath?: () => string | null } = {},
): string | null {
  const execPath = o.execPath ?? process.execPath;
  const versions = o.versions ?? process.versions;
  if (isNodeStandalone(execPath, versions)) return execPath;
  const v = (o.versionPath ?? pathVersion)();
  return v && versionSufficient(v) ? 'node' : null;
}
