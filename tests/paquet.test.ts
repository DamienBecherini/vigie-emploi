// Paquet npm : ressources livrées et chemins résolus depuis le JavaScript compilé (dist/).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const racine = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(racine, 'package.json'), 'utf8')) as {
  private?: boolean;
  files: string[];
  bin: Record<string, string>;
  dependencies: Record<string, string>;
};

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const c = join(dossier, n);
    return statSync(c).isDirectory() ? fichiers(c) : [c];
  });
}

describe('paquet npm', () => {
  it('livre le code compilé et les ressources lues à l’exécution', () => {
    expect(pkg.private).toBeUndefined();
    for (const f of ['bin', 'dist', 'migrations', 'modele', 'gabarits', 'exemples', 'AGENTS.md']) expect(pkg.files).toContain(f);
    expect(pkg.files).not.toContain('src');
  });

  it('n’a pas de .gitignore dans le modèle (npm ne le livrerait pas)', () => {
    expect(fichiers(join(racine, 'modele')).filter((f) => /[\\/]\.gitignore$/.test(f))).toEqual([]);
    expect(existsSync(join(racine, 'modele', 'gitignore'))).toBe(true);
  });

  it('n’importe à l’exécution que des dépendances déclarées (l’interface est livrée compilée)', () => {
    const importes = new Set<string>();
    for (const f of fichiers(join(racine, 'src'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/from '([^.'][^']*)'/g)) {
        if (m[1].startsWith('node:')) continue;
        importes.add(m[1].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0]);
      }
    }
    for (const nom of importes) expect(Object.keys(pkg.dependencies), nom).toContain(nom);
  });

  // Après « npm run build » (fait par prepack) : le JavaScript compilé retrouve la racine du paquet.
  it.skipIf(!existsSync(join(racine, 'dist', 'core', 'config.js')))('résout les chemins de ressources depuis dist/', async () => {
    const config = await import(pathToFileURL(join(racine, 'dist', 'core', 'config.js')).href);
    expect(resolve(config.RACINE_APP)).toBe(racine);
    const init = await import(pathToFileURL(join(racine, 'dist', 'init', 'init.js')).href);
    expect(existsSync(join(init.MODELE, 'AGENTS.md'))).toBe(true);
    expect(existsSync(init.CONSIGNES_APP)).toBe(true);
    const cv = await import(pathToFileURL(join(racine, 'dist', 'cv', 'cv.js')).href);
    expect(existsSync(join(cv.GABARIT_DEFAUT, 'gabarit.css'))).toBe(true);
    const grille = await import(pathToFileURL(join(racine, 'dist', 'core', 'grille-stockage.js')).href);
    expect(existsSync(grille.EXEMPLE_GRILLE)).toBe(true);
    const base = await import(pathToFileURL(join(racine, 'dist', 'db', 'base.js')).href);
    expect(base.migrations().length).toBeGreaterThan(0);
  });
});
