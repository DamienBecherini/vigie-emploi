// Multilingual (phase B): English workspace template (scaffold-en), English sample rubric, application instructions
// in English, MCP server and core messages in the configuration's language.
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

/** Files of a folder (relative paths, hidden files included), sorted. */
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
  it('has exactly the same tree as scaffold (a file added on one side only makes it fail)', () => {
    expect(tree(join(APP, 'scaffold-en'))).toEqual(tree(join(APP, 'scaffold')));
  });

  it('keeps the same {{…}} markers as the French template, file by file', () => {
    const markers = (f: string) => [...new Set(readFileSync(f, 'utf8').match(/\{\{\w+\}\}/g) ?? [])].sort();
    for (const f of tree(join(APP, 'scaffold'))) {
      expect(markers(join(APP, 'scaffold-en', f)), f).toEqual(markers(join(APP, 'scaffold', f)));
    }
  });
});

describe('init --language en', () => {
  const workspace = join(root, 'workspace-en');
  const r = initializeWorkspace({ folder: workspace, language: 'en', env: { VIGIE_EMPLOI_BROWSER: '/nulle/part' } });

  it('copies scaffold-en without a remaining marker, with the .gitignore', () => {
    for (const f of tree(workspace).filter((x) => /\.(md|txt)$/.test(x))) {
      expect(readFileSync(join(workspace, f), 'utf8'), f).not.toMatch(/\{\{\w+\}\}/);
    }
    expect(existsSync(join(workspace, '.gitignore'))).toBe(true);
    expect(readFileSync(join(workspace, 'AGENTS.md'), 'utf8')).toMatch(/^# Instructions for the AI/);
    expect(readFileSync(join(workspace, '_CONTEXTE.md'), 'utf8')).toMatch(/^# Context — TO BE COMPLETED/);
    expect(r.warnings.join('\n')).not.toMatch(/French/);
  });

  it('points the application’s instructions to AGENTS.en.md', () => {
    expect(nameInstructionsApp('en')).toBe('AGENTS.en.md');
    expect(nameInstructionsApp('fr')).toBe('AGENTS.md');
    expect(readFileSync(join(workspace, 'AGENTS.md'), 'utf8')).toMatch(/its instructions: `[^`]+\/AGENTS\.en\.md`/);
    expect(readFileSync(join(workspace, 'procedures', 'traiter-emails.md'), 'utf8')).toContain('/AGENTS.en.md');
  });

  it('installs the English rubric, valid', () => {
    expect(readFileRubric(join(workspace, 'profil', 'grille.json'))?.rubric.name).toBe('Sample grid');
    const c = loadConfig({ cwd: workspace, env: {} });
    const db = openDatabase(c.database);
    const g = rubricRequired(db, c.dataDir);
    expect(g.rubric.criteria.find((x) => x.id === 'technique')?.label).toBe('Technical fit');
    expect(g.rubric.examples).toHaveLength(3);
    db.close();
  });
});

describe('core messages', () => {
  it('in English when the language is “en”, in French by default', () => {
    expect(() => readDateEvent('32/13/2026')).toThrow(/^Date invalide/);
    defineLanguage('en');
    expect(() => readDateEvent('pas une date')).toThrow(/^Invalid date: "pas une date" \(expected DD\/MM\/YYYY/);
    expect(readDateEvent('tomorrow', new Date(2026, 10, 12))).toBe('2026-11-13');
  });

  it('configuration error recognized by its code, message in the variable’s language', () => {
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

  it('count recognizes the English separators', () => {
    const blocks = countText('Remark\n──── start of message ────\nHello there\n──── end of message ────\nAfter');
    expect(blocks).toEqual([{ start: 'Hello there', characters: 11, words: 2 }]);
  });
});

describe('MCP server in English', () => {
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

  it('instructions, tools and prompts in English', async () => {
    expect(instructions).toMatch(/^vigie-emploi helps the user/);
    expect(instructions).not.toMatch(/recherche d'emploi/);
    const { tools } = await client.listTools();
    const list = tools.find((t) => t.name === 'list_offers')!;
    expect(list.title).toBe('List job ads');
    expect(JSON.stringify(list.inputSchema)).toContain('Full-text search');
    const { prompts } = await client.listPrompts();
    expect(prompts.find((p) => p.name === 'onboarding')?.title).toBe('Guided onboarding');
  });

  it('workspace not initialized error in English, then creation of the workspace in English', async () => {
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
