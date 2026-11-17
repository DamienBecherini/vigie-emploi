// Documentation: every relative link of a tracked Markdown document leads somewhere, and every document of the
// English-first layout has its French version (README.md / README.fr.md, docs/x.md / docs/x.fr.md…).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANGUAGE_REFERENCE, LANGUAGES } from '../src/i18n/tool.ts';

const root = resolve(import.meta.dirname, '..');
/** Documents of the application itself (the workspace templates have their own links, relative to a workspace). */
const FOLDERS = ['.', 'docs', 'docs/adr', '.github'];

function documents(): string[] {
  return FOLDERS.flatMap((folder) =>
    readdirSync(join(root, folder))
      .filter((n) => n.endsWith('.md'))
      .map((n) => (folder === '.' ? n : `${folder}/${n}`)),
  );
}

/** Anchor GitHub gives a heading: lower case, punctuation removed, spaces turned into hyphens. */
function anchor(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/[^\p{L}\p{N}\- ]/gu, '')
    .replace(/ /g, '-');
}

function anchors(file: string): Set<string> {
  const text = readFileSync(join(root, file), 'utf8').replace(/```[\s\S]*?```/g, '');
  return new Set([...text.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((m) => anchor(m[1])));
}

/** Relative links of a document: [text](target) and src / href attributes, code blocks left out. */
function links(file: string): string[] {
  const text = readFileSync(join(root, file), 'utf8')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, (code) => (code.includes('](') ? '' : code));
  const found = [...text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g), ...text.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  return found.filter((l) => !/^(https?:|mailto:)/.test(l));
}

describe('documentation', () => {
  it('has no broken relative link (file or heading)', () => {
    const broken: string[] = [];
    for (const file of documents()) {
      for (const link of links(file)) {
        const [path, fragment] = link.split('#');
        const target = path ? join(dirname(file), decodeURIComponent(path)).replace(/\\/g, '/') : file;
        if (!existsSync(join(root, target))) {
          broken.push(`${file}: ${link}`);
          continue;
        }
        if (fragment && target.endsWith('.md') && statSync(join(root, target)).isFile() && !anchors(target).has(decodeURIComponent(fragment))) {
          broken.push(`${file}: ${link} (no such heading)`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('gives every document its version in each language (x.md in English, x.<language>.md)', () => {
    const others = LANGUAGES.filter((l) => l !== LANGUAGE_REFERENCE);
    const suffixed = new RegExp(`\\.(${LANGUAGES.join('|')})\\.md$`);
    // One file each: read by tools or by GitHub under that exact name, or a record kept in one language.
    const single = ['CHANGELOG.md', '.github/SECURITY.md'];
    const missing: string[] = [];
    for (const file of documents()) {
      if (suffixed.test(file) || single.includes(file)) continue;
      for (const l of others) {
        const translated = file.replace(/\.md$/, `.${l}.md`);
        if (!existsSync(join(root, translated))) missing.push(translated);
      }
    }
    expect(missing).toEqual([]);
  });
});
