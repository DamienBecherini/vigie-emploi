// Accès confiné aux fichiers de l'espace (outils lister_fichiers, lire_fichier, ecrire_fichier, deplacer_fichier),
// extraction de texte (Word) et comptage des caractères.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { pathInWorkspace, moveWorkspace, writeWorkspace, readWorkspace, listWorkspace } from '../src/core/access-files.ts';
import { countText } from '../src/core/count.ts';
import { textDocx } from '../src/core/extraction.ts';

const root = mkdtempSync(join(tmpdir(), 'vigie-emploi-fichiers-'));
const workspace = join(root, 'workspace');
const outside = join(root, 'outside');
mkdirSync(join(workspace, 'data'), { recursive: true });
mkdirSync(join(workspace, 'cv'), { recursive: true });
mkdirSync(outside, { recursive: true });
writeFileSync(join(workspace, 'data', 'vigie-emploi.sqlite'), 'database');
writeFileSync(join(workspace, '_CONTEXTE.md'), '# Contexte\n');
writeFileSync(join(workspace, '.mcp.json'), '{}');
writeFileSync(join(outside, 'secret.txt'), 'secret');
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** Crée un lien symbolique, ou renvoie false si le système le refuse (Windows sans mode développeur). */
function link(target: string, path: string, type: 'file' | 'junction' | 'dir'): boolean {
  try {
    symlinkSync(target, path, type);
    return true;
  } catch {
    return false;
  }
}

describe('confinement des chemins', () => {
  it('accepte un chemin relatif, ou absolu dans l’espace', () => {
    expect(pathInWorkspace(workspace, '_CONTEXTE.md').relative).toBe('_CONTEXTE.md');
    expect(pathInWorkspace(workspace, './cv/x.md').relative).toBe('cv/x.md');
    expect(pathInWorkspace(workspace, 'cv\\nouveau.md').relative).toBe('cv/nouveau.md');
    expect(pathInWorkspace(workspace, join(workspace, '_CONTEXTE.md')).relative).toBe('_CONTEXTE.md');
    expect(pathInWorkspace(workspace, join(workspace, '_CONTEXTE.md')).exists).toBe(true);
  });

  it.each([
    ['../outside/secret.txt', /refusé/],
    ['cv/../../outside/secret.txt', /refusé/],
    ['cv/..', /refusé/],
    ['..\\dehors\\secret.txt', /refusé/],
    [join(outside, 'secret.txt'), /hors de l'espace/],
    ['C:/Windows/win.ini', /hors de l'espace/],
    ['/etc/passwd', /hors de l'espace/],
    ['data/vigie-emploi.sqlite', /data\//],
    ['DATA/vigie-emploi.sqlite', /data\//],
    ['data./vigie-emploi.sqlite', /invalide/],
    ['./data', /data\//],
    ['.mcp.json', /caché/],
    ['cv/.git/config', /caché/],
    ['_CONTEXTE.md:flux', /invalide/],
    ['cv/a\u0000b.md', /invalide/],
  ])('refuse %s', (path, error) => {
    expect(() => pathInWorkspace(workspace, path)).toThrow(error);
  });

  it('refuse un lien symbolique qui sort de l’espace (sauté si le système interdit les liens)', (ctx) => {
    const file = link(join(outside, 'secret.txt'), join(workspace, 'link-file.txt'), 'file');
    const folder = link(outside, join(workspace, 'link-folder'), 'junction');
    const toData = link(join(workspace, 'data'), join(workspace, 'link-data'), 'junction');
    if (!file && !folder && !toData) ctx.skip();
    if (file) expect(() => readWorkspace(workspace, 'link-file.txt')).toThrow(/sort de l'espace/);
    if (folder) {
      expect(() => readWorkspace(workspace, 'link-folder/secret.txt')).toThrow(/sort de l'espace/);
      expect(() => writeWorkspace(workspace, 'link-folder/new.md', 'x')).toThrow(/sort de l'espace/);
      expect(existsSync(join(outside, 'new.md'))).toBe(false);
      expect(listWorkspace(workspace).inputs.map((e) => e.path)).not.toContain('link-folder/');
    }
    if (toData) expect(() => readWorkspace(workspace, 'link-data/vigie-emploi.sqlite')).toThrow(/Accès refusé/);
  });
});

describe('lister, écrire, lire, déplacer', () => {
  it('écrit puis relit un fichier, en créant les dossiers parents', () => {
    const r = writeWorkspace(workspace, 'candidatures/acme-dev/dossier-candidature.md', '# Acme\n\nÉcarts : aucun.\n');
    expect(r).toMatchObject({ path: 'candidatures/acme-dev/dossier-candidature.md', existed: false, old_size: null });
    const l = readWorkspace(workspace, 'candidatures/acme-dev/dossier-candidature.md');
    expect(l.kind).toBe('text');
    expect(l.kind === 'text' && l.text).toBe('# Acme\n\nÉcarts : aucun.\n');
  });

  it('signale un remplacement, et refuse d’écraser avec creer_seulement', () => {
    const r = writeWorkspace(workspace, '_CONTEXTE.md', '# Contexte rempli\n');
    expect(r.existed).toBe(true);
    expect(r.old_size).toBe(11);
    expect(() => writeWorkspace(workspace, '_CONTEXTE.md', 'x', { createOnly: true })).toThrow(/existe déjà/);
    expect(readFileSync(join(workspace, '_CONTEXTE.md'), 'utf8')).toBe('# Contexte rempli\n');
  });

  it('n’écrit que du texte, jamais dans data/', () => {
    expect(() => writeWorkspace(workspace, 'cv/CV.pdf', 'x')).toThrow(/Extension non autorisée/);
    expect(() => writeWorkspace(workspace, 'tool.js', 'x')).toThrow(/Extension non autorisée/);
    expect(() => writeWorkspace(workspace, 'data/score.md', 'x')).toThrow(/data\//);
    expect(readFileSync(join(workspace, 'data', 'vigie-emploi.sqlite'), 'utf8')).toBe('database');
  });

  it('liste sans data/ ni fichiers cachés, sur la profondeur demandée', () => {
    const one = listWorkspace(workspace).inputs.map((e) => e.path);
    expect(one).toEqual(expect.arrayContaining(['_CONTEXTE.md', 'cv/', 'candidatures/']));
    expect(one).not.toContain('data/');
    expect(one).not.toContain('.mcp.json');
    expect(one).not.toContain('candidatures/acme-dev/');
    const three = listWorkspace(workspace, '.', 3).inputs.map((e) => e.path);
    expect(three).toContain('candidatures/acme-dev/dossier-candidature.md');
    expect(() => listWorkspace(workspace, 'data')).toThrow(/data\//);
    expect(() => listWorkspace(workspace, '..')).toThrow(/refusé/);
  });

  it('déplace sans écraser', () => {
    writeWorkspace(workspace, 'a-deposer/notes.txt', 'scores');
    expect(moveWorkspace(workspace, 'a-deposer/notes.txt', 'candidatures/acme-dev/notes.txt')).toEqual({
      source: 'a-deposer/notes.txt',
      destination: 'candidatures/acme-dev/notes.txt',
    });
    writeWorkspace(workspace, 'a-deposer/notes.txt', 'other');
    expect(() => moveWorkspace(workspace, 'a-deposer/notes.txt', 'candidatures/acme-dev/notes.txt')).toThrow(/existe déjà/);
    expect(() => moveWorkspace(workspace, 'a-deposer/notes.txt', '../dehors/notes.txt')).toThrow(/refusé/);
    expect(() => moveWorkspace(workspace, 'data/vigie-emploi.sqlite', 'database.sqlite')).toThrow(/data\//);
  });

  it('lit un fichier binaire en octets (PDF, image…)', () => {
    writeFileSync(join(workspace, 'a-deposer', 'photo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const l = readWorkspace(workspace, 'a-deposer/photo.png');
    expect(l.kind).toBe('binary');
    expect(l.kind === 'binary' && l.extension).toBe('.png');
  });
});

/** Archive ZIP minimale (un fichier compressé en deflate), comme un .docx. */
function zip(name: string, content: string): Buffer {
  const data = Buffer.from(content, 'utf8');
  const compressed = deflateRawSync(data);
  const n = Buffer.from(name, 'utf8');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(n.length, 28);
  central.writeUInt32LE(0, 42);
  const startCentral = local.length + n.length + compressed.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + n.length, 12);
  end.writeUInt32LE(startCentral, 16);
  return Buffer.concat([local, n, compressed, central, n, end]);
}

describe('extraction et comptage', () => {
  it('extrait le texte d’un document Word', () => {
    const xml =
      '<w:document><w:body><w:p><w:r><w:t>Thomas RENAUD</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Développeur PHP &amp; Python</w:t></w:r></w:p></w:body></w:document>';
    expect(textDocx(zip('word/document.xml', xml))).toBe('Thomas RENAUD\nDéveloppeur PHP & Python');
    expect(textDocx(Buffer.from('pas une archive'))).toBeNull();
  });

  it('compte chaque bloc à copier-coller, sinon le texte entier', () => {
    const text =
      'Avant\n──────── début du message ────────\nBonjour 👋\nMerci.\n──────── fin du message ────────\n' +
      'Entre\n──── début du message 2 ────\nCourt\n──── fin ────\n';
    const blocks = countText(text.replace(/\n/g, '\r\n'));
    expect(blocks.map((b) => b.characters)).toEqual([16, 5]);
    expect(blocks[0].words).toBe(3);
    expect(countText('  Un deux trois  ')).toEqual([{ start: 'Un deux trois', characters: 13, words: 3 }]);
  });
});
