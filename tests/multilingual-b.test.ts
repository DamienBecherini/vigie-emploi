// Multilingue (phase B) : modèle d'espace anglais (modele-en), grille d'exemple anglaise, consignes de l'application
// en anglais, serveur MCP et messages du noyau dans la langue de la configuration.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { loadConfig, ErrorConfig } from '../src/core/config.ts';
import { initializeWorkspace, nameInstructionsApp } from '../src/init/init.ts';
import { openDatabase } from '../src/db/database.ts';
import { rubricRequired } from '../src/core/rubric-storage.ts';
import { readFileRubric } from '../src/core/rubric-storage.ts';
import { readDateEvent, eventOrError } from '../src/core/events.ts';
import { countText } from '../src/core/count.ts';
import { defineLanguage } from '../src/i18n/index.ts';
import { createServerMcp } from '../src/mcp/server.ts';
import { openState, type StateMcp } from '../src/mcp/state.ts';

const APP = join(import.meta.dirname, '..');
const root = mkdtempSync(join(tmpdir(), 'vigie-emploi-i18n-b-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
afterEach(() => defineLanguage('fr'));

/** Fichiers d'un dossier (chemins relatifs, fichiers cachés compris), triés. */
function tree(folder: string): string[] {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else files.push(relative(folder, path).replace(/\\/g, '/'));
    }
  };
  walk(folder);
  return files.sort();
}

describe('scaffold-en', () => {
  it('a exactement la même arborescence que modele (un fichier ajouté d’un seul côté fait échouer)', () => {
    expect(tree(join(APP, 'scaffold-en'))).toEqual(tree(join(APP, 'scaffold')));
  });

  it('garde les mêmes marqueurs {{…}} que le modèle français, fichier par fichier', () => {
    const markers = (f: string) => [...new Set(readFileSync(f, 'utf8').match(/\{\{\w+\}\}/g) ?? [])].sort();
    for (const f of tree(join(APP, 'scaffold'))) {
      expect(markers(join(APP, 'scaffold-en', f)), f).toEqual(markers(join(APP, 'scaffold', f)));
    }
  });
});

describe('init --langue en', () => {
  const workspace = join(root, 'workspace-en');
  const r = initializeWorkspace({ folder: workspace, language: 'en', env: { VIGIE_EMPLOI_BROWSER: '/nulle/part' } });

  it('copie modele-en sans marqueur restant, avec le .gitignore', () => {
    for (const f of tree(workspace).filter((x) => /\.(md|txt)$/.test(x))) {
      expect(readFileSync(join(workspace, f), 'utf8'), f).not.toMatch(/\{\{\w+\}\}/);
    }
    expect(existsSync(join(workspace, '.gitignore'))).toBe(true);
    expect(readFileSync(join(workspace, 'AGENTS.md'), 'utf8')).toMatch(/^# Instructions for the AI/);
    expect(readFileSync(join(workspace, '_CONTEXTE.md'), 'utf8')).toMatch(/^# Context — TO BE COMPLETED/);
    expect(r.warnings.join('\n')).not.toMatch(/French/);
  });

  it('pointe les consignes de l’application vers AGENTS.en.md', () => {
    expect(nameInstructionsApp('en')).toBe('AGENTS.en.md');
    expect(nameInstructionsApp('fr')).toBe('AGENTS.md');
    expect(readFileSync(join(workspace, 'AGENTS.md'), 'utf8')).toMatch(/its instructions: `[^`]+\/AGENTS\.en\.md`/);
    expect(readFileSync(join(workspace, 'procedures', 'traiter-emails.md'), 'utf8')).toContain('/AGENTS.en.md');
  });

  it('installe la grille anglaise, valide', () => {
    expect(readFileRubric(join(workspace, 'profil', 'grille.json'))?.rubric.name).toBe('Sample grid');
    const c = loadConfig({ cwd: workspace, env: {} });
    const db = openDatabase(c.database);
    const g = rubricRequired(db, c.dataDir);
    expect(g.rubric.criteria.find((x) => x.id === 'technique')?.label).toBe('Technical fit');
    expect(g.rubric.examples).toHaveLength(3);
    db.close();
  });
});

describe('messages du noyau', () => {
  it('en anglais quand la langue est « en », en français par défaut', () => {
    expect(() => readDateEvent('32/13/2026')).toThrow(/^Date invalide/);
    defineLanguage('en');
    expect(() => readDateEvent('pas une date')).toThrow(/^Invalid date: "pas une date" \(expected DD\/MM\/YYYY/);
    expect(readDateEvent('tomorrow', new Date(2026, 10, 12))).toBe('2026-11-13');
  });

  it('erreur de configuration reconnue par son code, message dans la langue de la variable', () => {
    let e: unknown;
    try {
      loadConfig({ cwd: root, env: { VIGIE_EMPLOI_LANGUAGE: 'en' } });
    } catch (x) {
      e = x;
    }
    expect(e).toBeInstanceOf(ErrorConfig);
    expect((e as ErrorConfig).code).toBe('not-configured');
    expect((e as Error).message).toMatch(/^Data folder not configured/);
  });

  it('compter reconnaît les séparateurs anglais', () => {
    const blocks = countText('Remark\n──── start of message ────\nHello there\n──── end of message ────\nAfter');
    expect(blocks).toEqual([{ start: 'Hello there', characters: 11, words: 2 }]);
  });
});

describe('serveur MCP en anglais', () => {
  const workspace = join(root, 'mcp-en');
  let state: StateMcp;
  let client: Client;
  let instructions: string | undefined;

  beforeAll(async () => {
    state = openState({ dataDir: workspace, env: { VIGIE_EMPLOI_LANGUAGE: 'en' }, cwd: root });
    const server = createServerMcp(state);
    const [side1, side2] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test', version: '1.0.0' });
    await Promise.all([server.connect(side2), client.connect(side1)]);
    instructions = client.getInstructions();
  });
  afterAll(async () => {
    await client.close();
    state.db?.close();
  });

  it('instructions, outils et prompts en anglais', async () => {
    expect(instructions).toMatch(/^vigie-emploi helps the user/);
    expect(instructions).not.toMatch(/recherche d'emploi/);
    const { tools } = await client.listTools();
    const list = tools.find((t) => t.name === 'list_offers')!;
    expect(list.title).toBe('List job ads');
    expect(JSON.stringify(list.inputSchema)).toContain('Full-text search');
    const { prompts } = await client.listPrompts();
    expect(prompts.find((p) => p.name === 'onboarding')?.title).toBe('Guided onboarding');
  });

  it('erreur d’espace non initialisé en anglais, puis création de l’espace en anglais', async () => {
    defineLanguage('en');
    const r = (await client.callTool({ name: 'list_offers', arguments: {} })) as { isError?: boolean; content: { text: string }[] };
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/^Error: Workspace not initialised/);
    const created = (await client.callTool({ name: 'initialize_workspace', arguments: {} })) as { content: { text: string }[] };
    const res = JSON.parse(created.content[0].text) as { ok: boolean; more: string[] };
    expect(res.ok).toBe(true);
    expect(res.more[0]).toMatch(/^Ask the user to drop their CV/);
    expect(readFileSync(join(workspace, 'DEMARRAGE.md'), 'utf8')).toMatch(/^# Onboarding/);
    expect(JSON.parse(readFileSync(join(workspace, 'vigie-emploi.config.json'), 'utf8')).language).toBe('en');
    const prompt = await client.getPrompt({ name: 'onboarding' });
    const text = (prompt.messages[0].content as { text: string }).text;
    expect(text).toMatch(/^Instructions of my vigie-emploi workspace/);
    expect(text).toMatch(/Talk to me in English\.$/);
    expect(() => eventOrError(state.db!, 999)).toThrow('Event 999 not found');
  });
});
