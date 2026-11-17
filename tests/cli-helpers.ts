// Shared helpers of the CLI tests (tests/cli-*.test.ts): run main() with its output captured, in a temporary
// workspace, without depending on the machine's environment (VIGIE_EMPLOI_* variables, browser installed).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { main } from '../src/cli/main.ts';
import { closeDatabases } from './cli-databases.ts';

export const FIXTURES = join(import.meta.dirname, 'fixtures').replace(/\\/g, '/');

export interface Run {
  code: number;
  /** process.stdout.write + console.log */
  out: string;
  /** process.stderr.write + console.error */
  err: string;
}

/** Runs the CLI with stdout, stderr, console.log and console.error captured (restored after the run). */
export async function cli(...args: string[]): Promise<Run> {
  const out: string[] = [];
  const err: string[] = [];
  const spies = [
    vi.spyOn(process.stdout, 'write').mockImplementation((x) => {
      out.push(String(x));
      return true;
    }),
    vi.spyOn(process.stderr, 'write').mockImplementation((x) => {
      err.push(String(x));
      return true;
    }),
    vi.spyOn(console, 'log').mockImplementation((...x) => void out.push(`${x.join(' ')}\n`)),
    vi.spyOn(console, 'error').mockImplementation((...x) => void err.push(`${x.join(' ')}\n`)),
  ];
  try {
    const code = await main(args);
    return { code, out: out.join(''), err: err.join('') };
  } finally {
    for (const s of spies) s.mockRestore();
    closeDatabases();
  }
}

/** Parsed JSON output of a run that must have succeeded. */
export function parsed<T = Record<string, unknown>>(r: Run): T {
  if (r.code !== 0) throw new Error(`exit code ${r.code}: ${r.err}`);
  return JSON.parse(r.out) as T;
}

const VARIABLES = ['DATA', 'CONFIG', 'DATABASE', 'LANGUAGE', 'PORT', 'MAIL_PASSWORD'];

/**
 * Registers the hooks of a CLI test file: environment emptied of the VIGIE_EMPLOI_* variables (an empty value counts
 * as absent), no browser, mocks restored after each test, temporary folder removed at the end.
 * Returns the temporary folder (forward slashes).
 */
export function isolate(name: string): { root: () => string } {
  let root = '';
  beforeAll(() => {
    for (const v of VARIABLES) vi.stubEnv(`VIGIE_EMPLOI_${v}`, '');
    vi.stubEnv('VIGIE_EMPLOI_BROWSER', join(tmpdir(), 'vigie-emploi-no-browser', 'chrome.exe'));
    root = mkdtempSync(join(tmpdir(), `vigie-emploi-cli-${name}-`)).replace(/\\/g, '/');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });
  return { root: () => root };
}

/** Workspace created by "init <folder> --language <language>"; returns a runner that adds "--data <folder>". */
export async function workspace(folder: string, language: 'en' | 'fr' = 'en') {
  const r = await cli('init', folder, '--language', language, '--json');
  if (r.code !== 0) throw new Error(`init failed: ${r.err}`);
  return (...args: string[]) => cli(...args, '--data', folder);
}
