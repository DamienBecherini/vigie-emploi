// Adding a language (docs/ajouter-une-langue.md): each language declared in LANGUAGES must have all its
// resources. The keys of the dictionaries (CLI, interface, MCP server) are checked by the compiler; this test covers the
// files (workspace template, instructions, sample rubric, README) and the texts left empty or still in French.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANGUAGE_DEFAULT, LANGUAGES, LOCALES, NAMES_LANGUAGES, translate } from '../src/i18n/tool.ts';
import { DICTIONARIES } from '../src/i18n/index.ts';
import { DICTIONARIES_UI } from '../ui/src/i18n/index.ts';
import { DICTIONARIES_MCP } from '../src/mcp/texts.ts';
import { normalizeLanguage } from '../src/core/config.ts';
import { APP_ROOT } from '../src/core/config.ts';

const OTHERS = LANGUAGES.filter((l) => l !== LANGUAGE_DEFAULT);

function files(folder: string): string[] {
  const output: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else output.push(relative(folder, p).replace(/\\/g, '/'));
    }
  };
  walk(folder);
  return output.sort();
}

describe('declared languages', () => {
  it('have a valid locale and a name, recognized as a value of “language”', () => {
    for (const l of LANGUAGES) {
      expect(() => new Intl.NumberFormat(LOCALES[l])).not.toThrow();
      expect(NAMES_LANGUAGES[l]).toBeTruthy();
      expect(normalizeLanguage(NAMES_LANGUAGES[l])).toBe(l);
      expect(normalizeLanguage(l.toUpperCase())).toBe(l);
    }
  });

  it.each(OTHERS)('%s : modèle d’espace complet (mêmes fichiers que modele/)', (l) => {
    const translated = join(APP_ROOT, `scaffold-${l}`);
    expect(existsSync(translated), `scaffold-${l}/ manquant`).toBe(true);
    expect(files(translated)).toEqual(files(join(APP_ROOT, 'scaffold')));
  });

  it.each(OTHERS)('%s : consignes, grille d’exemple et README traduits', (l) => {
    for (const f of [`AGENTS.${l}.md`, `examples/rubric.${l}.json`, `README.${l}.md`]) {
      expect(existsSync(join(APP_ROOT, f)), `${f} manquant`).toBe(true);
    }
  });

  it.each(OTHERS)('%s : aucun texte vide ni recopié du français dans les dictionnaires', (l) => {
    const suspicious: string[] = [];
    for (const [name, set] of [
      ['src', DICTIONARIES],
      ['ui', DICTIONARIES_UI],
      ['mcp', DICTIONARIES_MCP],
    ] as const) {
      const database = set[LANGUAGE_DEFAULT] as Record<string, unknown>;
      const target = set[l] as Record<string, unknown>;
      for (const key of Object.keys(database)) {
        const text = translate(target[key] as never, l, { n: 2 });
        if (!text.trim()) suspicious.push(`${name} ${key} : vide`);
        // A text identical to the French one is suspicious only if it contains accented letters or common French
        // words (proper names, acronyms and commands rightly stay identical).
        const fr = translate(database[key] as never, LANGUAGE_DEFAULT, { n: 2 });
        if (text === fr && /[éèêàùç]|\b(le|la|les|des|une|est|pour|avec)\b/i.test(fr)) suspicious.push(`${name} ${key} : identique au français`);
      }
    }
    expect(suspicious).toEqual([]);
  });
});
