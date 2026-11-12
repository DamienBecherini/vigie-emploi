// Multilingue (phase B) : modèle d'espace anglais (modele-en), grille d'exemple anglaise, consignes de l'application
// en anglais, serveur MCP et messages du noyau dans la langue de la configuration.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { chargerConfig, ErreurConfig } from '../src/core/config.ts';
import { initialiserEspace, nomConsignesApp } from '../src/init/init.ts';
import { ouvrirBase } from '../src/db/base.ts';
import { grilleObligatoire } from '../src/core/grille-stockage.ts';
import { lireFichierGrille } from '../src/core/grille-stockage.ts';
import { lireDateEvenement, evenementOuErreur } from '../src/core/evenements.ts';
import { compterTexte } from '../src/core/compter.ts';
import { definirLangue } from '../src/i18n/index.ts';
import { creerServeurMcp } from '../src/mcp/serveur.ts';
import { ouvrirEtat, type EtatMcp } from '../src/mcp/etat.ts';

const APP = join(import.meta.dirname, '..');
const racine = mkdtempSync(join(tmpdir(), 'postuler-juste-i18n-b-'));
afterAll(() => rmSync(racine, { recursive: true, force: true }));
afterEach(() => definirLangue('fr'));

/** Fichiers d'un dossier (chemins relatifs, fichiers cachés compris), triés. */
function arborescence(dossier: string): string[] {
  const fichiers: string[] = [];
  const parcourir = (d: string) => {
    for (const nom of readdirSync(d)) {
      const chemin = join(d, nom);
      if (statSync(chemin).isDirectory()) parcourir(chemin);
      else fichiers.push(relative(dossier, chemin).replace(/\\/g, '/'));
    }
  };
  parcourir(dossier);
  return fichiers.sort();
}

describe('modele-en', () => {
  it('a exactement la même arborescence que modele (un fichier ajouté d’un seul côté fait échouer)', () => {
    expect(arborescence(join(APP, 'modele-en'))).toEqual(arborescence(join(APP, 'modele')));
  });

  it('garde les mêmes marqueurs {{…}} que le modèle français, fichier par fichier', () => {
    const marqueurs = (f: string) => [...new Set(readFileSync(f, 'utf8').match(/\{\{\w+\}\}/g) ?? [])].sort();
    for (const f of arborescence(join(APP, 'modele'))) {
      expect(marqueurs(join(APP, 'modele-en', f)), f).toEqual(marqueurs(join(APP, 'modele', f)));
    }
  });
});

describe('init --langue en', () => {
  const espace = join(racine, 'espace-en');
  const r = initialiserEspace({ dossier: espace, langue: 'en', env: { POSTULER_JUSTE_NAVIGATEUR: '/nulle/part' } });

  it('copie modele-en sans marqueur restant, avec le .gitignore', () => {
    for (const f of arborescence(espace).filter((x) => /\.(md|txt)$/.test(x))) {
      expect(readFileSync(join(espace, f), 'utf8'), f).not.toMatch(/\{\{\w+\}\}/);
    }
    expect(existsSync(join(espace, '.gitignore'))).toBe(true);
    expect(readFileSync(join(espace, 'AGENTS.md'), 'utf8')).toMatch(/^# Instructions for the AI/);
    expect(readFileSync(join(espace, '_CONTEXTE.md'), 'utf8')).toMatch(/^# Context — TO BE COMPLETED/);
    expect(r.avertissements.join('\n')).not.toMatch(/French/);
  });

  it('pointe les consignes de l’application vers AGENTS.en.md', () => {
    expect(nomConsignesApp('en')).toBe('AGENTS.en.md');
    expect(nomConsignesApp('fr')).toBe('AGENTS.md');
    expect(readFileSync(join(espace, 'AGENTS.md'), 'utf8')).toMatch(/its instructions: `[^`]+\/AGENTS\.en\.md`/);
    expect(readFileSync(join(espace, 'procedures', 'traiter-emails.md'), 'utf8')).toContain('/AGENTS.en.md');
  });

  it('installe la grille anglaise, valide', () => {
    expect(lireFichierGrille(join(espace, 'profil', 'grille.json'))?.grille.nom).toBe('Sample grid');
    const c = chargerConfig({ cwd: espace, env: {} });
    const db = ouvrirBase(c.base);
    const g = grilleObligatoire(db, c.dossierDonnees);
    expect(g.grille.criteres.find((x) => x.id === 'technique')?.libelle).toBe('Technical fit');
    expect(g.grille.exemples).toHaveLength(3);
    db.close();
  });
});

describe('messages du noyau', () => {
  it('en anglais quand la langue est « en », en français par défaut', () => {
    expect(() => lireDateEvenement('32/13/2026')).toThrow(/^Date invalide/);
    definirLangue('en');
    expect(() => lireDateEvenement('pas une date')).toThrow(/^Invalid date: "pas une date" \(expected DD\/MM\/YYYY/);
    expect(lireDateEvenement('tomorrow', new Date(2026, 10, 12))).toBe('2026-11-13');
  });

  it('erreur de configuration reconnue par son code, message dans la langue de la variable', () => {
    let e: unknown;
    try {
      chargerConfig({ cwd: racine, env: { POSTULER_JUSTE_LANGUE: 'en' } });
    } catch (x) {
      e = x;
    }
    expect(e).toBeInstanceOf(ErreurConfig);
    expect((e as ErreurConfig).code).toBe('non-configure');
    expect((e as Error).message).toMatch(/^Data folder not configured/);
  });

  it('compter reconnaît les séparateurs anglais', () => {
    const blocs = compterTexte('Remark\n──── start of message ────\nHello there\n──── end of message ────\nAfter');
    expect(blocs).toEqual([{ debut: 'Hello there', caracteres: 11, mots: 2 }]);
  });
});

describe('serveur MCP en anglais', () => {
  const espace = join(racine, 'mcp-en');
  let etat: EtatMcp;
  let client: Client;
  let instructions: string | undefined;

  beforeAll(async () => {
    etat = ouvrirEtat({ dossierDonnees: espace, env: { POSTULER_JUSTE_LANGUE: 'en' }, cwd: racine });
    const serveur = creerServeurMcp(etat);
    const [cote1, cote2] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test', version: '1.0.0' });
    await Promise.all([serveur.connect(cote2), client.connect(cote1)]);
    instructions = client.getInstructions();
  });
  afterAll(async () => {
    await client.close();
    etat.db?.close();
  });

  it('instructions, outils et prompts en anglais', async () => {
    expect(instructions).toMatch(/^postuler-juste helps the user/);
    expect(instructions).not.toMatch(/recherche d'emploi/);
    const { tools } = await client.listTools();
    const lister = tools.find((t) => t.name === 'lister_offres')!;
    expect(lister.title).toBe('List job ads');
    expect(JSON.stringify(lister.inputSchema)).toContain('Full-text search');
    const { prompts } = await client.listPrompts();
    expect(prompts.find((p) => p.name === 'demarrage')?.title).toBe('Guided onboarding');
  });

  it('erreur d’espace non initialisé en anglais, puis création de l’espace en anglais', async () => {
    definirLangue('en');
    const r = (await client.callTool({ name: 'lister_offres', arguments: {} })) as { isError?: boolean; content: { text: string }[] };
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/^Error: Workspace not initialised/);
    const cree = (await client.callTool({ name: 'initialiser_espace', arguments: {} })) as { content: { text: string }[] };
    const res = JSON.parse(cree.content[0].text) as { ok: boolean; suite: string[] };
    expect(res.ok).toBe(true);
    expect(res.suite[0]).toMatch(/^Ask the user to drop their CV/);
    expect(readFileSync(join(espace, 'DEMARRAGE.md'), 'utf8')).toMatch(/^# Onboarding/);
    expect(JSON.parse(readFileSync(join(espace, 'postuler-juste.config.json'), 'utf8')).langue).toBe('en');
    const prompt = await client.getPrompt({ name: 'demarrage' });
    const texte = (prompt.messages[0].content as { text: string }).text;
    expect(texte).toMatch(/^Instructions of my postuler-juste workspace/);
    expect(texte).toMatch(/Talk to me in English\.$/);
    expect(() => evenementOuErreur(etat.db!, 999)).toThrow('Event 999 not found');
  });
});
