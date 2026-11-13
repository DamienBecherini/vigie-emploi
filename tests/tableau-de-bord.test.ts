// Tableau de bord sans terminal (outil MCP ouvrir_tableau_de_bord), choix de l'exécutable Node,
// réglages de l'extension Claude Desktop (variables vides ou non substituées, langue saisie à la main).
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { chargerConfig, type Config } from '../src/core/config.ts';
import { commandeNode, estNodeAutonome, nodeExecutable, versionSuffisante } from '../src/core/node.ts';
import { initialiserEspace } from '../src/init/init.ts';
import { creerServeurMcp, ouvrirEtatTolerant } from '../src/mcp/serveur.ts';
import { ouvrirEtat } from '../src/mcp/etat.ts';
import { lancerDetache, ouvrirTableauDeBord, sonder, type Dependances, type Sante } from '../src/mcp/tableau-de-bord.ts';

const racine = mkdtempSync(join(tmpdir(), 'vigie-emploi-tableau-'));
afterAll(() => rmSync(racine, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));

const sansElectron = { node: '24.12.0' } as unknown as NodeJS.ProcessVersions;
const electron = { node: '24.22.1', electron: '45.2.1' } as unknown as NodeJS.ProcessVersions;

describe('exécutable Node', () => {
  it('reconnaît un vrai node, pas une application Electron', () => {
    expect(estNodeAutonome('C:\\Program Files\\nodejs\\node.exe', sansElectron)).toBe(true);
    expect(estNodeAutonome('/usr/bin/node', sansElectron)).toBe(true);
    expect(estNodeAutonome('C:\\Program Files\\WindowsApps\\Claude\\app\\claude.exe', electron)).toBe(false);
    expect(estNodeAutonome('/usr/bin/node', electron)).toBe(false);
  });

  it('commande des autres clients MCP : chemin du node courant, sinon « node »', () => {
    expect(commandeNode('/usr/bin/node', sansElectron)).toBe('/usr/bin/node');
    expect(commandeNode('C:/Claude/claude.exe', electron)).toBe('node');
  });

  it('dans Claude Desktop : node du système s’il est assez récent, sinon rien', () => {
    expect(nodeExecutable({ execPath: '/usr/bin/node', versions: sansElectron })).toBe('/usr/bin/node');
    expect(nodeExecutable({ execPath: 'claude.exe', versions: electron, versionPath: () => 'v24.12.0' })).toBe('node');
    expect(nodeExecutable({ execPath: 'claude.exe', versions: electron, versionPath: () => 'v20.18.0' })).toBeNull();
    expect(nodeExecutable({ execPath: 'claude.exe', versions: electron, versionPath: () => null })).toBeNull();
  });

  it('version minimale', () => {
    expect(versionSuffisante('v24.0.0')).toBe(true);
    expect(versionSuffisante('25.1.0')).toBe(true);
    expect(versionSuffisante('v22.13.0')).toBe(false);
    expect(versionSuffisante('n/a')).toBe(false);
  });
});

describe('réglages de l’extension Claude Desktop', () => {
  const dossier = join(racine, 'reglages');

  it('variable vide ou non substituée = absente', () => {
    const c = chargerConfig({ dossierDonnees: dossier, env: { VIGIE_EMPLOI_LANGUE: '${user_config.langue}' }, cwd: racine });
    expect(c.langue).toBe('fr');
    const e = ouvrirEtat({ env: { VIGIE_EMPLOI_DATA: '${user_config.dossier}' }, cwd: racine });
    expect(e.parDefaut).toBe(true);
  });

  it('langue saisie à la main : casse et noms tolérés', () => {
    expect(chargerConfig({ dossierDonnees: dossier, env: { VIGIE_EMPLOI_LANGUE: ' EN ' }, cwd: racine }).langue).toBe('en');
    expect(chargerConfig({ dossierDonnees: dossier, env: { VIGIE_EMPLOI_LANGUE: 'English' }, cwd: racine }).langue).toBe('en');
    expect(chargerConfig({ dossierDonnees: dossier, env: { VIGIE_EMPLOI_LANGUE: 'Français' }, cwd: racine }).langue).toBe('fr');
  });

  it('langue inconnue : le serveur MCP démarre quand même (langue ignorée)', () => {
    expect(() => ouvrirEtat({ dossierDonnees: dossier, env: { VIGIE_EMPLOI_LANGUE: 'de' }, cwd: racine })).toThrow(/de/);
    const e = ouvrirEtatTolerant({ dossierDonnees: dossier, env: { VIGIE_EMPLOI_LANGUE: 'de' }, cwd: racine });
    expect(e.config.langue).toBe('fr');
  });
});

/** Dépendances simulées : ports occupés selon `ports`, lancements notés. */
function simuler(ports: Record<number, Sante>, o: { node?: string | null; repond?: boolean; dossier?: string } = {}) {
  const lances: { mode: string; port: number }[] = [];
  const ouverts: string[] = [];
  const dep: Dependances = {
    sonder: async (port) => ports[port] ?? null,
    node: () => (o.node === undefined ? '/usr/bin/node' : o.node),
    lancerDetache: (_node, config, port) => {
      lances.push({ mode: 'detache', port });
      if (o.repond !== false) ports[port] = { service: 'vigie-emploi', dossier: o.dossier ?? config.dossierDonnees };
      return 1234;
    },
    lancerHeberge: async (_config, port) => {
      lances.push({ mode: 'heberge', port });
    },
    attendre: async () => undefined,
    ouvrirNavigateur: (url) => ouverts.push(url),
  };
  return { dep, lances, ouverts };
}

describe('ouvrir_tableau_de_bord (logique)', () => {
  const config = { dossierDonnees: join(racine, 'espace'), port: 4410, langue: 'fr' } as Config;

  it('tableau de bord déjà lancé pour cet espace : son adresse, sans relancer', async () => {
    const { dep, lances, ouverts } = simuler({ 4410: { service: 'vigie-emploi', dossier: config.dossierDonnees.toUpperCase() } });
    const r = await ouvrirTableauDeBord(config, {}, dep);
    expect(r).toMatchObject({ url: 'http://localhost:4410/', deja_lance: true, mode: 'existant', navigateur_ouvert: false });
    expect(lances).toEqual([]);
    expect(ouverts).toEqual([]);
  });

  it('port pris par un autre espace ou un autre logiciel : port suivant libre, processus détaché', async () => {
    const { dep, lances, ouverts } = simuler({
      4410: { service: 'vigie-emploi', dossier: '/autre/espace' },
      4411: { service: null },
    });
    const r = await ouvrirTableauDeBord(config, { ouvrir: true }, dep);
    expect(r).toMatchObject({ url: 'http://localhost:4412/', deja_lance: false, mode: 'detache', arret_auto_min: 60, navigateur_ouvert: true });
    expect(lances).toEqual([{ mode: 'detache', port: 4412 }]);
    expect(ouverts).toEqual(['http://localhost:4412/']);
  });

  it('sans node utilisable (Node intégré de Claude Desktop seul) : dans le processus du serveur MCP', async () => {
    const { dep, lances } = simuler({}, { node: null });
    const r = await ouvrirTableauDeBord(config, {}, dep);
    expect(r.mode).toBe('heberge');
    expect(r.a_dire).toMatch(/tant que/);
    expect(lances).toEqual([{ mode: 'heberge', port: 4410 }]);
  });

  it('processus lancé qui ne répond pas : erreur avec la commande de secours', async () => {
    const { dep } = simuler({}, { repond: false });
    await expect(ouvrirTableauDeBord(config, {}, dep)).rejects.toThrow(/serve --data/);
  });

  it('tous les ports occupés : erreur claire', async () => {
    const pris = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [4410 + i, { service: null }]));
    const { dep } = simuler(pris);
    await expect(ouvrirTableauDeBord(config, {}, dep)).rejects.toThrow(/4410 à 4419/);
  });
});

/** Port libre attribué par le système. */
function portLibre(): Promise<number> {
  return new Promise((res) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => res(port));
    });
  });
}

describe('ouvrir_tableau_de_bord (réel)', () => {
  const espace = join(racine, 'reel');

  it('espace non initialisé : erreur claire par le serveur MCP', async () => {
    const etat = ouvrirEtat({ dossierDonnees: join(racine, 'absent'), env: {}, cwd: racine });
    const serveur = creerServeurMcp(etat);
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1.0.0' });
    await Promise.all([serveur.connect(b), client.connect(a)]);
    const r = (await client.callTool({ name: 'ouvrir_tableau_de_bord', arguments: {} })) as { isError?: boolean; content: { text: string }[] };
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/initialiser_espace/);
    await client.close();
  });

  it('démarre un tableau de bord détaché qui répond sur /api/sante, puis le retrouve', async () => {
    initialiserEspace({ dossier: espace, env: {} });
    const port = await portLibre();
    const config = { ...chargerConfig({ dossierDonnees: espace, env: {}, cwd: espace }), port };
    let pid: number | undefined;
    const dep: Dependances = {
      sonder,
      node: () => process.execPath,
      lancerDetache: (node, c, p) => (pid = lancerDetache(node, c, p)),
      lancerHeberge: async () => {
        throw new Error('inattendu');
      },
      attendre: (ms) => new Promise((r) => setTimeout(r, ms)),
      ouvrirNavigateur: () => undefined,
    };
    try {
      const r = await ouvrirTableauDeBord(config, {}, dep);
      expect(r).toMatchObject({ url: `http://localhost:${port}/`, deja_lance: false, mode: 'detache' });
      const sante = (await (await fetch(`http://127.0.0.1:${port}/api/sante`)).json()) as { inactivite: { delai_s: number } };
      expect(sante.inactivite.delai_s).toBe(3600);
      const encore = await ouvrirTableauDeBord(config, {}, dep);
      expect(encore).toMatchObject({ deja_lance: true, mode: 'existant' });
    } finally {
      if (pid) process.kill(pid);
    }
  }, 30_000);
});
