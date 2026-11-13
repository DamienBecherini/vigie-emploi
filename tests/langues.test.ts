// Ajout d'une langue (docs/ajouter-une-langue.md) : chaque langue déclarée dans LANGUES doit avoir toutes ses
// ressources. Les clés des dictionnaires (CLI, interface, serveur MCP) sont vérifiées par le compilateur ; ce test couvre les
// fichiers (modèle d'espace, consignes, grille d'exemple, README) et les textes vides ou restés en français.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANGUE_DEFAUT, LANGUES, LOCALES, NOMS_LANGUES, traduire } from '../src/i18n/outil.ts';
import { DICTIONNAIRES } from '../src/i18n/index.ts';
import { DICTIONNAIRES_UI } from '../ui/src/i18n/index.ts';
import { DICTIONNAIRES_MCP } from '../src/mcp/textes.ts';
import { normaliserLangue } from '../src/core/config.ts';
import { RACINE_APP } from '../src/core/config.ts';

const AUTRES = LANGUES.filter((l) => l !== LANGUE_DEFAUT);

function fichiers(dossier: string): string[] {
  const sortie: string[] = [];
  const parcourir = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) parcourir(p);
      else sortie.push(relative(dossier, p).replace(/\\/g, '/'));
    }
  };
  parcourir(dossier);
  return sortie.sort();
}

describe('langues déclarées', () => {
  it('ont une locale valide et un nom, reconnu comme valeur de « langue »', () => {
    for (const l of LANGUES) {
      expect(() => new Intl.NumberFormat(LOCALES[l])).not.toThrow();
      expect(NOMS_LANGUES[l]).toBeTruthy();
      expect(normaliserLangue(NOMS_LANGUES[l])).toBe(l);
      expect(normaliserLangue(l.toUpperCase())).toBe(l);
    }
  });

  it.each(AUTRES)('%s : modèle d’espace complet (mêmes fichiers que modele/)', (l) => {
    const traduit = join(RACINE_APP, `modele-${l}`);
    expect(existsSync(traduit), `modele-${l}/ manquant`).toBe(true);
    expect(fichiers(traduit)).toEqual(fichiers(join(RACINE_APP, 'modele')));
  });

  it.each(AUTRES)('%s : consignes, grille d’exemple et README traduits', (l) => {
    for (const f of [`AGENTS.${l}.md`, `exemples/grille.${l}.json`, `README.${l}.md`]) {
      expect(existsSync(join(RACINE_APP, f)), `${f} manquant`).toBe(true);
    }
  });

  it.each(AUTRES)('%s : aucun texte vide ni recopié du français dans les dictionnaires', (l) => {
    const suspects: string[] = [];
    for (const [nom, jeu] of [
      ['src', DICTIONNAIRES],
      ['ui', DICTIONNAIRES_UI],
      ['mcp', DICTIONNAIRES_MCP],
    ] as const) {
      const base = jeu[LANGUE_DEFAUT] as Record<string, unknown>;
      const cible = jeu[l] as Record<string, unknown>;
      for (const cle of Object.keys(base)) {
        const texte = traduire(cible[cle] as never, l, { n: 2 });
        if (!texte.trim()) suspects.push(`${nom} ${cle} : vide`);
        // Un texte identique au français est suspect seulement s'il contient des lettres accentuées ou des mots
        // français courants (les noms propres, sigles et commandes restent identiques à bon droit).
        const fr = traduire(base[cle] as never, LANGUE_DEFAUT, { n: 2 });
        if (texte === fr && /[éèêàùç]|\b(le|la|les|des|une|est|pour|avec)\b/i.test(fr)) suspects.push(`${nom} ${cle} : identique au français`);
      }
    }
    expect(suspects).toEqual([]);
  });
});
