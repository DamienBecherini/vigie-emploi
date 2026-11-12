// Accès confiné aux fichiers de l'espace (outils lister_fichiers, lire_fichier, ecrire_fichier, deplacer_fichier),
// extraction de texte (Word) et comptage des caractères.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { cheminDansEspace, deplacerEspace, ecrireEspace, lireEspace, listerEspace } from '../src/core/acces-fichiers.ts';
import { compterTexte } from '../src/core/compter.ts';
import { texteDocx } from '../src/core/extraction.ts';

const racine = mkdtempSync(join(tmpdir(), 'postuler-juste-fichiers-'));
const espace = join(racine, 'espace');
const dehors = join(racine, 'dehors');
mkdirSync(join(espace, 'data'), { recursive: true });
mkdirSync(join(espace, 'cv'), { recursive: true });
mkdirSync(dehors, { recursive: true });
writeFileSync(join(espace, 'data', 'postuler-juste.sqlite'), 'base');
writeFileSync(join(espace, '_CONTEXTE.md'), '# Contexte\n');
writeFileSync(join(espace, '.mcp.json'), '{}');
writeFileSync(join(dehors, 'secret.txt'), 'secret');
afterAll(() => rmSync(racine, { recursive: true, force: true }));

/** Crée un lien symbolique, ou renvoie false si le système le refuse (Windows sans mode développeur). */
function lien(cible: string, chemin: string, type: 'file' | 'junction' | 'dir'): boolean {
  try {
    symlinkSync(cible, chemin, type);
    return true;
  } catch {
    return false;
  }
}

describe('confinement des chemins', () => {
  it('accepte un chemin relatif, ou absolu dans l’espace', () => {
    expect(cheminDansEspace(espace, '_CONTEXTE.md').relatif).toBe('_CONTEXTE.md');
    expect(cheminDansEspace(espace, './cv/x.md').relatif).toBe('cv/x.md');
    expect(cheminDansEspace(espace, 'cv\\nouveau.md').relatif).toBe('cv/nouveau.md');
    expect(cheminDansEspace(espace, join(espace, '_CONTEXTE.md')).relatif).toBe('_CONTEXTE.md');
    expect(cheminDansEspace(espace, join(espace, '_CONTEXTE.md')).existe).toBe(true);
  });

  it.each([
    ['../dehors/secret.txt', /refusé/],
    ['cv/../../dehors/secret.txt', /refusé/],
    ['cv/..', /refusé/],
    ['..\\dehors\\secret.txt', /refusé/],
    [join(dehors, 'secret.txt'), /hors de l'espace/],
    ['C:/Windows/win.ini', /hors de l'espace/],
    ['/etc/passwd', /hors de l'espace/],
    ['data/postuler-juste.sqlite', /data\//],
    ['DATA/postuler-juste.sqlite', /data\//],
    ['data./postuler-juste.sqlite', /invalide/],
    ['./data', /data\//],
    ['.mcp.json', /caché/],
    ['cv/.git/config', /caché/],
    ['_CONTEXTE.md:flux', /invalide/],
    ['cv/a\u0000b.md', /invalide/],
  ])('refuse %s', (chemin, erreur) => {
    expect(() => cheminDansEspace(espace, chemin)).toThrow(erreur);
  });

  it('refuse un lien symbolique qui sort de l’espace (sauté si le système interdit les liens)', (ctx) => {
    const fichier = lien(join(dehors, 'secret.txt'), join(espace, 'lien-fichier.txt'), 'file');
    const dossier = lien(dehors, join(espace, 'lien-dossier'), 'junction');
    const versData = lien(join(espace, 'data'), join(espace, 'lien-data'), 'junction');
    if (!fichier && !dossier && !versData) ctx.skip();
    if (fichier) expect(() => lireEspace(espace, 'lien-fichier.txt')).toThrow(/sort de l'espace/);
    if (dossier) {
      expect(() => lireEspace(espace, 'lien-dossier/secret.txt')).toThrow(/sort de l'espace/);
      expect(() => ecrireEspace(espace, 'lien-dossier/nouveau.md', 'x')).toThrow(/sort de l'espace/);
      expect(existsSync(join(dehors, 'nouveau.md'))).toBe(false);
      expect(listerEspace(espace).entrees.map((e) => e.chemin)).not.toContain('lien-dossier/');
    }
    if (versData) expect(() => lireEspace(espace, 'lien-data/postuler-juste.sqlite')).toThrow(/Accès refusé/);
  });
});

describe('lister, écrire, lire, déplacer', () => {
  it('écrit puis relit un fichier, en créant les dossiers parents', () => {
    const r = ecrireEspace(espace, 'candidatures/acme-dev/dossier-candidature.md', '# Acme\n\nÉcarts : aucun.\n');
    expect(r).toMatchObject({ chemin: 'candidatures/acme-dev/dossier-candidature.md', existait: false, ancienne_taille: null });
    const l = lireEspace(espace, 'candidatures/acme-dev/dossier-candidature.md');
    expect(l.genre).toBe('texte');
    expect(l.genre === 'texte' && l.texte).toBe('# Acme\n\nÉcarts : aucun.\n');
  });

  it('signale un remplacement, et refuse d’écraser avec creer_seulement', () => {
    const r = ecrireEspace(espace, '_CONTEXTE.md', '# Contexte rempli\n');
    expect(r.existait).toBe(true);
    expect(r.ancienne_taille).toBe(11);
    expect(() => ecrireEspace(espace, '_CONTEXTE.md', 'x', { creerSeulement: true })).toThrow(/existe déjà/);
    expect(readFileSync(join(espace, '_CONTEXTE.md'), 'utf8')).toBe('# Contexte rempli\n');
  });

  it('n’écrit que du texte, jamais dans data/', () => {
    expect(() => ecrireEspace(espace, 'cv/CV.pdf', 'x')).toThrow(/Extension non autorisée/);
    expect(() => ecrireEspace(espace, 'outil.js', 'x')).toThrow(/Extension non autorisée/);
    expect(() => ecrireEspace(espace, 'data/note.md', 'x')).toThrow(/data\//);
    expect(readFileSync(join(espace, 'data', 'postuler-juste.sqlite'), 'utf8')).toBe('base');
  });

  it('liste sans data/ ni fichiers cachés, sur la profondeur demandée', () => {
    const un = listerEspace(espace).entrees.map((e) => e.chemin);
    expect(un).toEqual(expect.arrayContaining(['_CONTEXTE.md', 'cv/', 'candidatures/']));
    expect(un).not.toContain('data/');
    expect(un).not.toContain('.mcp.json');
    expect(un).not.toContain('candidatures/acme-dev/');
    const trois = listerEspace(espace, '.', 3).entrees.map((e) => e.chemin);
    expect(trois).toContain('candidatures/acme-dev/dossier-candidature.md');
    expect(() => listerEspace(espace, 'data')).toThrow(/data\//);
    expect(() => listerEspace(espace, '..')).toThrow(/refusé/);
  });

  it('déplace sans écraser', () => {
    ecrireEspace(espace, 'a-deposer/notes.txt', 'notes');
    expect(deplacerEspace(espace, 'a-deposer/notes.txt', 'candidatures/acme-dev/notes.txt')).toEqual({
      source: 'a-deposer/notes.txt',
      destination: 'candidatures/acme-dev/notes.txt',
    });
    ecrireEspace(espace, 'a-deposer/notes.txt', 'autre');
    expect(() => deplacerEspace(espace, 'a-deposer/notes.txt', 'candidatures/acme-dev/notes.txt')).toThrow(/existe déjà/);
    expect(() => deplacerEspace(espace, 'a-deposer/notes.txt', '../dehors/notes.txt')).toThrow(/refusé/);
    expect(() => deplacerEspace(espace, 'data/postuler-juste.sqlite', 'base.sqlite')).toThrow(/data\//);
  });

  it('lit un fichier binaire en octets (PDF, image…)', () => {
    writeFileSync(join(espace, 'a-deposer', 'photo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const l = lireEspace(espace, 'a-deposer/photo.png');
    expect(l.genre).toBe('binaire');
    expect(l.genre === 'binaire' && l.extension).toBe('.png');
  });
});

/** Archive ZIP minimale (un fichier compressé en deflate), comme un .docx. */
function zip(nom: string, contenu: string): Buffer {
  const donnees = Buffer.from(contenu, 'utf8');
  const comprime = deflateRawSync(donnees);
  const n = Buffer.from(nom, 'utf8');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(comprime.length, 18);
  local.writeUInt32LE(donnees.length, 22);
  local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(comprime.length, 20);
  central.writeUInt32LE(donnees.length, 24);
  central.writeUInt16LE(n.length, 28);
  central.writeUInt32LE(0, 42);
  const debutCentral = local.length + n.length + comprime.length;
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(1, 8);
  fin.writeUInt16LE(1, 10);
  fin.writeUInt32LE(central.length + n.length, 12);
  fin.writeUInt32LE(debutCentral, 16);
  return Buffer.concat([local, n, comprime, central, n, fin]);
}

describe('extraction et comptage', () => {
  it('extrait le texte d’un document Word', () => {
    const xml =
      '<w:document><w:body><w:p><w:r><w:t>Thomas RENAUD</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Développeur PHP &amp; Python</w:t></w:r></w:p></w:body></w:document>';
    expect(texteDocx(zip('word/document.xml', xml))).toBe('Thomas RENAUD\nDéveloppeur PHP & Python');
    expect(texteDocx(Buffer.from('pas une archive'))).toBeNull();
  });

  it('compte chaque bloc à copier-coller, sinon le texte entier', () => {
    const texte =
      'Avant\n──────── début du message ────────\nBonjour 👋\nMerci.\n──────── fin du message ────────\n' +
      'Entre\n──── début du message 2 ────\nCourt\n──── fin ────\n';
    const blocs = compterTexte(texte.replace(/\n/g, '\r\n'));
    expect(blocs.map((b) => b.caracteres)).toEqual([16, 5]);
    expect(blocs[0].mots).toBe(3);
    expect(compterTexte('  Un deux trois  ')).toEqual([{ debut: 'Un deux trois', caracteres: 13, mots: 3 }]);
  });
});
