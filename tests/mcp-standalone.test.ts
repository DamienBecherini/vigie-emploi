// Standalone MCP server: a client without access to files nor to a terminal (Claude Desktop…) does the whole journey
// through the server: creation of the workspace, instructions as prompts, confined files, CV as PDF, counting.
import { appendFileSync, copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServerMcp } from '../src/mcp/server.ts';
import { openState, type StateMcp } from '../src/mcp/state.ts';
import { findBrowser } from '../src/cv/cv.ts';

const ROOT = join(import.meta.dirname, '..');
const root = mkdtempSync(join(tmpdir(), 'vigie-emploi-autonome-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

type Content = { type: string; text?: string; data?: string; mimeType?: string };
type Result = { isError?: boolean; content: Content[] };

function text(r: unknown): string {
  return (r as Result).content.map((c) => c.text ?? '').join('\n');
}

function json(r: unknown): Record<string, unknown> {
  const res = r as Result;
  if (res.isError) throw new Error(`Erreur de l'outil : ${text(r)}`);
  return JSON.parse(res.content[0].text!) as Record<string, unknown>;
}

function textPrompt(p: { messages: { content: unknown }[] }): string {
  return p.messages.map((m) => (m.content as { text: string }).text).join('\n');
}

describe('standalone MCP server (in memory)', () => {
  const workspace = join(root, 'ma-recherche');
  let state: StateMcp;
  let client: Client;
  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });

  beforeAll(async () => {
    state = openState({ dataDir: workspace, env: {}, cwd: root });
    const server = createServerMcp(state);
    const [side1, side2] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test', version: '1.0.0' });
    await Promise.all([server.connect(side2), client.connect(side1)]);
  });
  afterAll(async () => {
    await client.close();
    state.db?.close();
  });

  it('starts without a workspace: tools with a clear error, onboarding prompt that offers to create it', async () => {
    expect(state.db).toBeNull();
    expect(existsSync(workspace)).toBe(false);
    const stateWorkspace = json(await call('workspace_state'));
    expect(stateWorkspace).toMatchObject({ initialized: false, onboarding_done: false });
    for (const [tool, args] of [
      ['read_file', { path: 'AGENTS.md' }],
      ['write_file', { path: '_CONTEXTE.md', content: 'x' }],
      ['list_offers', {}],
      ['rubric', {}],
    ] as const) {
      const r = (await call(tool, args)) as Result;
      expect(r.isError, tool).toBe(true);
      expect(text(r)).toMatch(/Espace non initialisé.*initialiser_espace/);
    }
    expect(existsSync(workspace)).toBe(false);
    const p = await client.getPrompt({ name: 'onboarding' });
    expect(textPrompt(p)).toMatch(/initialiser_espace/);
    const other = await client.getPrompt({ name: 'process-emails' });
    expect(textPrompt(other)).toMatch(/prompt « demarrage »/);
  });

  it('lists the prompts of the workspace instructions', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual(['onboarding', 'prepare-go', 'process-emails', 'targeted-cv']);
    expect(prompts.find((p) => p.name === 'targeted-cv')!.arguments?.map((a) => a.name)).toEqual(['offer']);
  });

  it('initialize_workspace creates the workspace and the server settles in it', async () => {
    const inApp = (await call('initialize_workspace', { folder: join(ROOT, 'dry-run-workspace') })) as Result;
    expect(inApp.isError).toBe(true);
    expect(text(inApp)).toMatch(/dossier de l'application/);

    const r = json(await call('initialize_workspace', {}));
    expect(r.ok).toBe(true);
    expect(r.folder).toBe(workspace.replace(/\\/g, '/'));
    expect(r.warnings as string[]).not.toEqual(expect.arrayContaining([expect.stringMatching(/VIGIE_EMPLOI_DATA/)]));
    expect(existsSync(join(workspace, 'AGENTS.md'))).toBe(true);
    expect(state.db).not.toBeNull();
    expect(json(await call('list_offers'))).toMatchObject({ total: 0 });
    expect(json(await call('rubric'))).toMatchObject({ version: 1 });

    const again = (await call('initialize_workspace', {})) as Result;
    expect(again.isError).toBe(true);
    expect(text(again)).toMatch(/existe déjà/);
  });

  it('the prompts read the instructions from the disk at each call', async () => {
    const p = textPrompt(await client.getPrompt({ name: 'onboarding' }));
    expect(p).toContain('AGENTS.md');
    expect(p).toContain("# Consignes pour l'IA");
    expect(p).toContain('# Démarrage — consignes pour l');
    expect(p).toContain(workspace.replace(/\\/g, '/')); // {{WORKSPACE}} markers replaced by init
    expect(p).not.toMatch(/\{\{\w+\}\}/);
    expect(p).toMatch(/lire_fichier/);

    appendFileSync(join(workspace, 'procedures', 'traiter-emails.md'), '\nConsigne ajoutée par l’utilisateur : trier par date.\n');
    const t = textPrompt(await client.getPrompt({ name: 'process-emails' }));
    expect(t).toContain('Consigne ajoutée par l’utilisateur : trier par date.');
    expect(t).toContain('# Procédure : traiter les e-mails');

    const cv = textPrompt(await client.getPrompt({ name: 'targeted-cv', arguments: { offer: '#12 Acme' } }));
    expect(cv).toContain('# Procédure : CV ciblé');
    expect(cv).toContain('Offre visée : #12 Acme');
    expect(textPrompt(await client.getPrompt({ name: 'prepare-go' }))).toContain('# Procédure : préparer les candidatures');
  });

  it('expose AGENTS.md comme ressource', async () => {
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain('vigie-emploi://espace/AGENTS.md');
    const r = await client.readResource({ uri: 'vigie-emploi://espace/AGENTS.md' });
    expect((r.contents[0] as { text: string }).text).toContain('Règles non négociables');
  });

  it('writes then reads back, reports a replacement, refuses paths outside the workspace and data/', async () => {
    const first = json(await call('write_file', { path: 'candidatures/acme/dossier-candidature.md', content: '# Acme\n' }));
    expect(first).toMatchObject({ existed: false });
    expect(text(await call('read_file', { path: 'candidatures/acme/dossier-candidature.md' }))).toBe('# Acme\n');
    const context = json(await call('write_file', { path: '_CONTEXTE.md', content: '# Contexte\n' }));
    expect(context.existed).toBe(true);
    expect(context.old_size as number).toBeGreaterThan(100);

    for (const path of ['../outside.md', 'data/x.md', join(root, 'outside.md'), '.mcp.json']) {
      const r = (await call('write_file', { path, content: 'x' })) as Result;
      expect(r.isError, path).toBe(true);
    }
    expect(existsSync(join(root, 'outside.md'))).toBe(false);
    const read = (await call('read_file', { path: 'data/vigie-emploi.sqlite' })) as Result;
    expect(read.isError).toBe(true);

    const list = json(await call('list_files', { folder: 'candidatures', depth: 2 }));
    expect((list.inputs as { path: string }[]).map((e) => e.path)).toContain('candidatures/acme/dossier-candidature.md');
    expect(json(await call('move_file', { source: 'candidatures/acme/dossier-candidature.md', destination: 'candidatures/acme-dev/dossier-candidature.md' }))).toMatchObject({ ok: true });
  });

  it('reads the text of a dropped PDF and returns an image as an image', async () => {
    copyFileSync(join(ROOT, 'docs', 'exemples', 'CV-damien-becherini-sobre.pdf'), join(workspace, 'a-deposer', 'CV.pdf'));
    const pdf = text(await call('read_file', { path: 'a-deposer/CV.pdf' }));
    expect(pdf).toMatch(/PDF, 2 page\(s\), texte extrait/);
    expect(pdf).toContain('Damien BECHERINI');
    expect(pdf).toContain('----- page 2 / 2 -----');

    copyFileSync(join(ROOT, 'docs', 'captures', readdirPng()), join(workspace, 'a-deposer', 'capture.png'));
    const img = (await call('read_file', { path: 'a-deposer/capture.png' })) as Result;
    expect(img.content.map((c) => c.type)).toEqual(['text', 'image']);
    expect(img.content[1].mimeType).toBe('image/png');
  });

  it('counts the characters of a text or a file, lists and chooses the templates', async () => {
    expect(json(await call('count', { text: 'Bonjour à vous' }))).toMatchObject({ blocks: [{ characters: 14, words: 3 }] });
    const f = json(await call('count', { path: 'candidatures/acme-dev/dossier-candidature.md' }));
    expect(f).toMatchObject({ file: 'candidatures/acme-dev/dossier-candidature.md', blocks: [{ characters: 6 }] });
    expect((await call('count', {}) as Result).isError).toBe(true);

    const g = json(await call('list_templates')) as { templates: { name: string }[] };
    expect(g.templates.map((x) => x.name)).toEqual(expect.arrayContaining(['plain', 'modern', 'compact']));
    const c = json(await call('choose_template', { name: 'modern' }));
    expect(c).toMatchObject({ ok: true, folder: 'cv/gabarit' });
    expect(c.old).toMatch(/^cv\/gabarit-\d{8}-\d{6}$/);
    expect(readFileSync(join(workspace, 'cv', 'gabarit', 'gabarit.css'), 'utf8')).toMatch(/bandeau|moderne/i);
  });
});

/** A PNG capture shipped in docs/captures. */
function readdirPng(): string {
  return readdirSync(join(ROOT, 'docs', 'captures')).find((n) => n.endsWith('.png'))!;
}

describe('standalone MCP server (stdio, end to end)', () => {
  const workspace = join(root, 'dry-run-stdio');
  let client: Client;
  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });

  beforeAll(async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(ROOT, 'bin', 'vigie-emploi.js'), 'mcp'],
      cwd: root,
      env: { ...(process.env as Record<string, string>), VIGIE_EMPLOI_CONFIG: '', VIGIE_EMPLOI_DATA: workspace },
      stderr: 'pipe',
    });
    client = new Client({ name: 'dry_run', version: '1.0.0' });
    await client.connect(transport);
  }, 30_000);
  afterAll(async () => {
    await client?.close();
  });

  it('initialize → prompts → initialize_workspace → write / read → generate_cv with capture', async () => {
    expect(client.getServerCapabilities()).toMatchObject({ tools: {}, prompts: {}, resources: {} });
    expect(client.getInstructions()).toMatch(/initialiser_espace/);
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain('onboarding');
    expect(textPrompt(await client.getPrompt({ name: 'onboarding' }))).toMatch(/initialiser_espace/);
    const { tools } = await client.listTools();
    expect(tools.length).toBe(33);

    expect(json(await call('initialize_workspace'))).toMatchObject({ ok: true });
    expect(textPrompt(await client.getPrompt({ name: 'onboarding' }))).toContain('# Démarrage — consignes pour l');
    expect(json(await call('write_file', { path: 'a-deposer/notes.md', content: 'Mes notes\n' }))).toMatchObject({ existed: false });
    expect(text(await call('read_file', { path: 'a-deposer/notes.md' }))).toBe('Mes notes\n');

    if (!findBrowser()) return; // no Chrome / Edge: the PDF generation cannot be tried here
    const r = (await call('generate_cv', { path: 'cv/_exemple-structure.md', capture: true })) as Result;
    expect(r.isError, text(r)).toBeFalsy();
    const info = JSON.parse(r.content[0].text!) as Record<string, unknown>;
    expect(info).toMatchObject({ ok: true, pdf: 'cv/_exemple-structure.pdf', pages: 2, exceeded_2_pages: false, pdf_existed: false, template: 'cv/gabarit' });
    expect(existsSync(join(workspace, 'cv', '_exemple-structure.pdf'))).toBe(true);
    // Fill measured on the real PDF: one value in % per page.
    expect(info.fill).toHaveLength(2);
    for (const p of info.fill as string[]) expect(p).toMatch(/^page \d : \d{1,3} %$/);
    expect(Array.isArray(info.warnings)).toBe(true);
    expect(r.content[1]).toMatchObject({ type: 'image', mimeType: 'image/png' });
    expect(Buffer.from(r.content[1].data!, 'base64').subarray(1, 4).toString()).toBe('PNG');
  }, 90_000);
});
