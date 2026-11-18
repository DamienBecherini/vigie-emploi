// Rules on the source files themselves.
// - The code is commented in English: no comment of src/ or ui/src/ may still be a French sentence. The French
//   dictionaries are left out, and so are the French examples quoted in a comment (input the code parses): a comment
//   is taken for French only when its French function words outnumber its English ones.
// - A source file of src/ stays under 500 lines (the message dictionaries of src/i18n/ excepted).
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const DICTIONARIES = new Set(['src/i18n/fr.ts', 'src/mcp/i18n/fr.ts', 'ui/src/i18n/fr.ts']);
const FRENCH = new Set(
  'le la les des du un une est sont pour avec dans sur pas qui que aux depuis si ou et en ne au ce cette ces son sa ses leur à rien tel quel vide absente indisponible vaut on par plus sans déjà'.split(
    ' ',
  ),
);
const ENGLISH = new Set('the a an of is are to and in for with on by it its this that be not or from as at when then if no one'.split(' '));

function sources(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => join(folder, f));
}

/** Comments of a source: line comments (not the "//" of a URL in a string) and block comments. */
function comments(text: string): { line: number; text: string }[] {
  const found: { line: number; text: string }[] = [];
  for (const m of text.matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g)) {
    if (m[0].startsWith('//') && /[:'"`]/.test(text[m.index - 1] ?? '')) continue;
    found.push({ line: text.slice(0, m.index).split('\n').length, text: m[0] });
  }
  return found;
}

function isFrench(comment: string): boolean {
  const words = comment.toLowerCase().match(/[a-zàâçéèêëîïôûùüÿœ]+/g) ?? [];
  const fr = words.filter((w) => FRENCH.has(w)).length;
  const en = words.filter((w) => ENGLISH.has(w)).length;
  return fr >= 2 && fr > en;
}

describe('comments in English', () => {
  it('no French sentence left in the comments of src/ and ui/src/', () => {
    const french: string[] = [];
    for (const file of [...sources(join(ROOT, 'src')), ...sources(join(ROOT, 'ui', 'src'))]) {
      const rel = relative(ROOT, file).replace(/\\/g, '/');
      if (DICTIONARIES.has(rel)) continue;
      for (const c of comments(readFileSync(file, 'utf8'))) if (isFrench(c.text)) french.push(`${rel}:${c.line}: ${c.text}`);
    }
    expect(french).toEqual([]);
  });

  it('the check recognizes a French comment and lets an English one with a French example through', () => {
    expect(isFrench('/* stockage indisponible : la préférence vaut pour la session */')).toBe(true);
    expect(isFrench('// Date alone → YYYY-MM-DD; "≈ 25/08/2026", "après le 20/08/2026" kept as they are.')).toBe(false);
  });
});

describe('size of the source files', () => {
  it('no source file of src/ over 500 lines, the dictionaries of src/i18n/ excepted', () => {
    const long = sources(join(ROOT, 'src'))
      .map((file) => ({ rel: relative(ROOT, file).replace(/\\/g, '/'), lines: readFileSync(file, 'utf8').split('\n').length }))
      .filter((f) => !/^src\/i18n\/[a-z]{2}\.ts$/.test(f.rel) && f.lines > 500)
      .map((f) => `${f.rel}: ${f.lines}`);
    expect(long).toEqual([]);
  });
});
