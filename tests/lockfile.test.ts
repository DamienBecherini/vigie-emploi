// package-lock.json: every package it lists finds its dependencies in it.
// `npm install` run on Windows removes optional packages of the other platforms from the lockfile
// (@emnapi/core, @emnapi/runtime…) and `npm ci` then refuses it on the CI, on every system. This test says so before the push.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Entry {
  version?: string;
  dependencies?: Record<string, string>;
}

const root = resolve(import.meta.dirname, '..');
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as { packages: Record<string, Entry> };

/** Where Node would find `name` from the package at `path`: its own node_modules, then each parent's. */
function resolved(path: string, name: string): boolean {
  let folder = path;
  for (;;) {
    const candidate = folder ? `${folder}/node_modules/${name}` : `node_modules/${name}`;
    if (candidate in lock.packages) return true;
    if (!folder) return false;
    const cut = folder.lastIndexOf('/node_modules/');
    folder = cut < 0 ? '' : folder.slice(0, cut);
  }
}

describe('package-lock.json', () => {
  it('lists the dependencies of every package (restore the entries npm removed: see the comment at the top)', () => {
    const missing: string[] = [];
    for (const [path, entry] of Object.entries(lock.packages)) {
      // The lockfile lists bundled packages too (marked inBundle), so every dependency must be found in it.
      for (const name of Object.keys(entry.dependencies ?? {})) {
        if (!resolved(path, name)) missing.push(`${path || '(root)'} → ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
