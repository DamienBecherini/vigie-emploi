// Storage of the mailbox password outside the workspace, in the system's own protection:
// Windows: DPAPI (encrypted for the Windows user) in %APPDATA%/vigie-emploi/secrets;
// macOS: login keychain (`security`); Linux: Secret Service (`secret-tool`), or, without it,
// a file readable by the user alone in ~/.config/vigie-emploi/secrets.
// The password never goes on a command line: it is passed through standard input.
// VIGIE_EMPLOI_MAIL_PASSWORD, when set, takes precedence (Claude Desktop extension setting, CI).
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { variable } from '../core/config.ts';

export type SecretBackend = 'environment' | 'dpapi' | 'keychain' | 'secret-service' | 'file';

export interface SecretStore {
  /** Where the passwords are kept on this system. */
  backend(): SecretBackend;
  get(account: string): string | null;
  set(account: string, password: string): void;
  remove(account: string): void;
}

const SERVICE = 'vigie-emploi';

function run(command: string, args: string[], input?: string): { ok: boolean; out: string; err: string; missing: boolean } {
  const r = spawnSync(command, args, { input, encoding: 'utf8', windowsHide: true, timeout: 20000 });
  const missing = (r.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
  return { ok: r.status === 0 && !r.error, out: (r.stdout ?? '').replace(/\r?\n$/, ''), err: (r.stderr ?? '').trim(), missing };
}

/** File name of an account (letters, digits, dot, dash, underscore, at sign). */
function fileName(account: string): string {
  return account.replace(/[^\w.@-]/g, '_');
}

function folderSecrets(base: string): string {
  const folder = join(base, 'secrets');
  mkdirSync(folder, { recursive: true });
  return folder;
}

function dpapi(folderBase: string): SecretStore {
  const ps = (script: string, input: string) =>
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Add-Type -AssemblyName System.Security; ${script}`], input);
  const path = (account: string) => join(folderSecrets(folderBase), `${fileName(account)}.dpapi`);
  return {
    backend: () => 'dpapi',
    get(account) {
      const p = path(account);
      if (!existsSync(p)) return null;
      const r = ps(
        "$b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); [Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser')))",
        readFileSync(p, 'utf8'),
      );
      if (!r.ok) throw new Error(`DPAPI: ${r.err || 'decryption failed'}`);
      return r.out;
    },
    set(account, password) {
      const r = ps(
        "$b=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd()); [Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$null,'CurrentUser')))",
        password,
      );
      if (!r.ok || !r.out) throw new Error(`DPAPI: ${r.err || 'encryption failed'}`);
      writeFileSync(path(account), r.out, 'utf8');
    },
    remove(account) {
      const p = path(account);
      if (existsSync(p)) unlinkSync(p);
    },
  };
}

function keychain(): SecretStore {
  const quote = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return {
    backend: () => 'keychain',
    get(account) {
      const r = run('security', ['find-generic-password', '-s', SERVICE, '-a', account, '-w']);
      return r.ok ? r.out : null;
    },
    set(account, password) {
      // Interactive mode reads the command on standard input: the password stays out of the process list.
      const r = run('security', ['-i'], `add-generic-password -U -s ${quote(SERVICE)} -a ${quote(account)} -w ${quote(password)}\n`);
      if (!r.ok) throw new Error(`Keychain: ${r.err || 'write failed'}`);
    },
    remove(account) {
      run('security', ['delete-generic-password', '-s', SERVICE, '-a', account]);
    },
  };
}

function secretService(): SecretStore {
  const attrs = (account: string) => ['service', SERVICE, 'account', account];
  return {
    backend: () => 'secret-service',
    get(account) {
      const r = run('secret-tool', ['lookup', ...attrs(account)]);
      return r.ok && r.out ? r.out : null;
    },
    set(account, password) {
      const r = run('secret-tool', ['store', `--label=${SERVICE} ${account}`, ...attrs(account)], password);
      if (!r.ok) throw new Error(`Secret Service: ${r.err || 'write failed'}`);
    },
    remove(account) {
      run('secret-tool', ['clear', ...attrs(account)]);
    },
  };
}

/** Last resort (Linux without Secret Service): a file readable by the user alone. */
export function fileStore(folderBase: string): SecretStore {
  const path = (account: string) => join(folderSecrets(folderBase), fileName(account));
  return {
    backend: () => 'file',
    get(account) {
      const p = path(account);
      return existsSync(p) ? readFileSync(p, 'utf8') : null;
    },
    set(account, password) {
      const p = path(account);
      writeFileSync(p, password, { encoding: 'utf8', mode: 0o600 });
      chmodSync(p, 0o600);
    },
    remove(account) {
      const p = path(account);
      if (existsSync(p)) unlinkSync(p);
    },
  };
}

/** Secret Service installed but unreachable (no graphical session, WSL): the file takes over. */
function withFallback(main: SecretStore, fallback: SecretStore): SecretStore {
  let used: SecretStore = main;
  return {
    backend: () => used.backend(),
    get(account) {
      const v = main.get(account);
      if (v !== null) return v;
      return fallback.get(account);
    },
    set(account, password) {
      try {
        main.set(account, password);
        used = main;
        fallback.remove(account);
      } catch {
        fallback.set(account, password);
        used = fallback;
      }
    },
    remove(account) {
      main.remove(account);
      fallback.remove(account);
    },
  };
}

/** Folder of the application's own files for the user (outside every workspace). */
export function folderUser(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string {
  if (platform === 'win32') return join(env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), SERVICE);
  if (platform === 'darwin') return join(homedir(), 'Library', 'Application Support', SERVICE);
  return join(env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), SERVICE);
}

/** Store of the current system; the environment variable, when set, takes precedence for reading. */
export function secretStore(env: NodeJS.ProcessEnv = process.env, platform = process.platform): SecretStore {
  const base = folderUser(env, platform);
  let store: SecretStore;
  if (platform === 'win32') store = dpapi(base);
  else if (platform === 'darwin') store = keychain();
  else store = run('secret-tool', ['--version']).missing ? fileStore(base) : withFallback(secretService(), fileStore(base));
  const fromEnv = variable(env, 'MAIL_PASSWORD');
  if (!fromEnv) return store;
  return { ...store, backend: () => 'environment', get: () => fromEnv };
}
