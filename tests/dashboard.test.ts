// Tableau de bord sans terminal (outil MCP ouvrir_tableau_de_bord), choix de l'exécutable Node,
// réglages de l'extension Claude Desktop (variables vides ou non substituées, langue saisie à la main).
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { loadConfig, type Config } from '../src/core/config.ts';
import { commandNode, isNodeStandalone, nodeExecutable, versionSufficient } from '../src/core/node.ts';
import { initializeWorkspace } from '../src/init/init.ts';
import { createServerMcp, openStateTolerant } from '../src/mcp/server.ts';
import { openState } from '../src/mcp/state.ts';
import { launchDetached, openDashboard, probe, type Dependencies, type Health } from '../src/mcp/dashboard.ts';

const root = mkdtempSync(join(tmpdir(), 'vigie-emploi-tableau-'));
afterAll(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));

const withoutElectron = { node: '24.12.0' } as unknown as NodeJS.ProcessVersions;
const electron = { node: '24.22.1', electron: '45.2.1' } as unknown as NodeJS.ProcessVersions;

describe('exécutable Node', () => {
  it('reconnaît un vrai node, pas une application Electron', () => {
    expect(isNodeStandalone('C:\\Program Files\\nodejs\\node.exe', withoutElectron)).toBe(true);
    expect(isNodeStandalone('/usr/bin/node', withoutElectron)).toBe(true);
    expect(isNodeStandalone('C:\\Program Files\\WindowsApps\\Claude\\app\\claude.exe', electron)).toBe(false);
    expect(isNodeStandalone('/usr/bin/node', electron)).toBe(false);
  });

  it('commande des autres clients MCP : chemin du node courant, sinon « node »', () => {
    expect(commandNode('/usr/bin/node', withoutElectron)).toBe('/usr/bin/node');
    expect(commandNode('C:/Claude/claude.exe', electron)).toBe('node');
  });

  it('dans Claude Desktop : node du système s’il est assez récent, sinon rien', () => {
    expect(nodeExecutable({ execPath: '/usr/bin/node', versions: withoutElectron })).toBe('/usr/bin/node');
    expect(nodeExecutable({ execPath: 'claude.exe', versions: electron, versionPath: () => 'v24.12.0' })).toBe('node');
    expect(nodeExecutable({ execPath: 'claude.exe', versions: electron, versionPath: () => 'v20.18.0' })).toBeNull();
    expect(nodeExecutable({ execPath: 'claude.exe', versions: electron, versionPath: () => null })).toBeNull();
  });

  it('version minimale', () => {
    expect(versionSufficient('v24.0.0')).toBe(true);
    expect(versionSufficient('25.1.0')).toBe(true);
    expect(versionSufficient('v22.13.0')).toBe(false);
    expect(versionSufficient('n/a')).toBe(false);
  });
});

describe('réglages de l’extension Claude Desktop', () => {
  const folder = join(root, 'settings');

  it('variable vide ou non substituée = absente', () => {
    const c = loadConfig({ dataDir: folder, env: { VIGIE_EMPLOI_LANGUAGE: '${user_config.language}' }, cwd: root });
    expect(c.language).toBe('fr');
    const e = openState({ env: { VIGIE_EMPLOI_DATA: '${user_config.folder}' }, cwd: root });
    expect(e.byDefault).toBe(true);
  });

  it('langue saisie à la main : casse et noms tolérés', () => {
    expect(loadConfig({ dataDir: folder, env: { VIGIE_EMPLOI_LANGUAGE: ' EN ' }, cwd: root }).language).toBe('en');
    expect(loadConfig({ dataDir: folder, env: { VIGIE_EMPLOI_LANGUAGE: 'English' }, cwd: root }).language).toBe('en');
    expect(loadConfig({ dataDir: folder, env: { VIGIE_EMPLOI_LANGUAGE: 'Français' }, cwd: root }).language).toBe('fr');
  });

  it('langue inconnue : le serveur MCP démarre quand même (langue ignorée)', () => {
    expect(() => openState({ dataDir: folder, env: { VIGIE_EMPLOI_LANGUAGE: 'de' }, cwd: root })).toThrow(/de/);
    const e = openStateTolerant({ dataDir: folder, env: { VIGIE_EMPLOI_LANGUAGE: 'de' }, cwd: root });
    expect(e.config.language).toBe('fr');
  });
});

/** Dépendances simulées : ports occupés selon `ports`, lancements notés. */
function simulate(ports: Record<number, Health>, o: { node?: string | null; responds?: boolean; folder?: string } = {}) {
  const launched: { mode: string; port: number }[] = [];
  const open: string[] = [];
  const dep: Dependencies = {
    probe: async (port) => ports[port] ?? null,
    node: () => (o.node === undefined ? '/usr/bin/node' : o.node),
    launchDetached: (_node, config, port) => {
      launched.push({ mode: 'detached', port });
      if (o.responds !== false) ports[port] = { service: 'vigie-emploi', folder: o.folder ?? config.dataDir };
      return 1234;
    },
    launchHosted: async (_config, port) => {
      launched.push({ mode: 'hosted', port });
    },
    wait: async () => undefined,
    openBrowser: (url) => open.push(url),
  };
  return { dep, launched, open };
}

describe('ouvrir_tableau_de_bord (logique)', () => {
  const config = { dataDir: join(root, 'workspace'), port: 4410, language: 'fr' } as Config;

  it('tableau de bord déjà lancé pour cet espace : son adresse, sans relancer', async () => {
    const { dep, launched, open } = simulate({ 4410: { service: 'vigie-emploi', folder: config.dataDir.toUpperCase() } });
    const r = await openDashboard(config, {}, dep);
    expect(r).toMatchObject({ url: 'http://localhost:4410/', already_launched: true, mode: 'existing', browser_open: false });
    expect(launched).toEqual([]);
    expect(open).toEqual([]);
  });

  it('port pris par un autre espace ou un autre logiciel : port suivant libre, processus détaché', async () => {
    const { dep, launched, open } = simulate({
      4410: { service: 'vigie-emploi', folder: '/other/workspace' },
      4411: { service: null },
    });
    const r = await openDashboard(config, { open: true }, dep);
    expect(r).toMatchObject({ url: 'http://localhost:4412/', already_launched: false, mode: 'detached', stop_auto_min: 60, browser_open: true });
    expect(launched).toEqual([{ mode: 'detached', port: 4412 }]);
    expect(open).toEqual(['http://localhost:4412/']);
  });

  it('sans node utilisable (Node intégré de Claude Desktop seul) : dans le processus du serveur MCP', async () => {
    const { dep, launched } = simulate({}, { node: null });
    const r = await openDashboard(config, {}, dep);
    expect(r.mode).toBe('hosted');
    expect(r.to_tell).toMatch(/tant que/);
    expect(launched).toEqual([{ mode: 'hosted', port: 4410 }]);
  });

  it('processus lancé qui ne répond pas : erreur avec la commande de secours', async () => {
    const { dep } = simulate({}, { responds: false });
    await expect(openDashboard(config, {}, dep)).rejects.toThrow(/serve --data/);
  });

  it('tous les ports occupés : erreur claire', async () => {
    const taken = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [4410 + i, { service: null }]));
    const { dep } = simulate(taken);
    await expect(openDashboard(config, {}, dep)).rejects.toThrow(/4410 à 4419/);
  });
});

/** Port libre attribué par le système. */
function portFree(): Promise<number> {
  return new Promise((res) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => res(port));
    });
  });
}

describe('ouvrir_tableau_de_bord (réel)', () => {
  const workspace = join(root, 'real');

  it('espace non initialisé : erreur claire par le serveur MCP', async () => {
    const state = openState({ dataDir: join(root, 'absent'), env: {}, cwd: root });
    const server = createServerMcp(state);
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1.0.0' });
    await Promise.all([server.connect(b), client.connect(a)]);
    const r = (await client.callTool({ name: 'open_dashboard', arguments: {} })) as { isError?: boolean; content: { text: string }[] };
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/initialiser_espace/);
    await client.close();
  });

  it('démarre un tableau de bord détaché qui répond sur /api/sante, puis le retrouve', async () => {
    initializeWorkspace({ folder: workspace, env: {} });
    const port = await portFree();
    const config = { ...loadConfig({ dataDir: workspace, env: {}, cwd: workspace }), port };
    let pid: number | undefined;
    const dep: Dependencies = {
      probe,
      node: () => process.execPath,
      launchDetached: (node, c, p) => (pid = launchDetached(node, c, p)),
      launchHosted: async () => {
        throw new Error('unexpected');
      },
      wait: (ms) => new Promise((r) => setTimeout(r, ms)),
      openBrowser: () => undefined,
    };
    try {
      const r = await openDashboard(config, {}, dep);
      expect(r).toMatchObject({ url: `http://localhost:${port}/`, already_launched: false, mode: 'detached' });
      const health = (await (await fetch(`http://127.0.0.1:${port}/api/health`)).json()) as { idle: { timeout_s: number } };
      expect(health.idle.timeout_s).toBe(3600);
      const again = await openDashboard(config, {}, dep);
      expect(again).toMatchObject({ already_launched: true, mode: 'existing' });
    } finally {
      if (pid) process.kill(pid);
    }
  }, 30_000);
});
