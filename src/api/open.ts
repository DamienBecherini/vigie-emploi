// Opening of a workspace folder in the system's file explorer, and detection of the "local machine".
//
// A web page cannot open a local folder (file:// links are blocked from http://): so the server
// launches the explorer. It only does so for a request coming from the machine it runs on: elsewhere
// (phone, other computer), the explorer would open on that machine's screen, not on the user's.
import { spawn } from 'node:child_process';
import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

/** Opens a folder (absolute path, already checked) in the file explorer. */
export type OpenerFolder = (absolute: string) => Promise<void>;

/** Program that opens a folder in the explorer, depending on the system. */
export function programOpening(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') return 'explorer.exe';
  if (platform === 'darwin') return 'open';
  return 'xdg-open';
}

export function openerSystem(platform: NodeJS.Platform = process.platform): OpenerFolder {
  const program = programOpening(platform);
  return (absolute) =>
    new Promise((resolve, reject) => {
      // Detached and without waiting for the end: the explorer lives its own life (explorer.exe even returns code 1 on success).
      const p = spawn(program, [absolute], { detached: true, stdio: 'ignore', windowsHide: false });
      p.once('error', (e) => reject(Object.assign(new Error(e.message), { program })));
      p.once('spawn', () => {
        p.unref();
        resolve();
      });
    });
}

const ADDRESSES_LOCALES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Does the request come from the machine the server runs on? Based on the address of the TCP connection (not on a header,
 * which a client could make up). False if the address is unknown (test request without a real connection).
 */
export function isLocalRequest(c: Context): boolean {
  try {
    const address = getConnInfo(c).remote.address;
    return Boolean(address && (ADDRESSES_LOCALES.has(address) || address.startsWith('127.')));
  } catch {
    return false;
  }
}
