// Serveur MCP autonome : un client sans accès aux fichiers ni au terminal (Claude Desktop…) fait tout le parcours
// par le serveur : création de l'espace, consignes en prompts, fichiers confinés, CV en PDF, comptage.
import { appendFileSync, copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { creerServeurMcp } from '../src/mcp/serveur.ts';
import { ouvrirEtat, type EtatMcp } from '../src/mcp/etat.ts';
import { trouverNavigateur } from '../src/cv/cv.ts';

const RACINE = join(import.meta.dirname, '..');
const racine = mkdtempSync(join(tmpdir(), 'postuler-juste-autonome-'));
afterAll(() => rmSync(racine, { recursive: true, force: true }));

type Contenu = { type: string; text?: string; data?: string; mimeType?: string };
type Resultat = { isError?: boolean; content: Contenu[] };

function texte(r: unknown): string {
  return (r as Resultat).content.map((c) => c.text ?? '').join('\n');
}

function json(r: unknown): Record<string, unknown> {
  const res = r as Resultat;
  if (res.isError) throw new Error(`Erreur de l'outil : ${texte(r)}`);
  return JSON.parse(res.content[0].text!) as Record<string, unknown>;
}

function textePrompt(p: { messages: { content: unknown }[] }): string {
  return p.messages.map((m) => (m.content as { text: string }).text).join('\n');
}

describe('serveur MCP autonome (en mémoire)', () => {
  const espace = join(racine, 'ma-recherche');
  let etat: EtatMcp;
  let client: Client;
  const appeler = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });

  beforeAll(async () => {
    etat = ouvrirEtat({ dossierDonnees: espace, env: {}, cwd: racine });
    const serveur = creerServeurMcp(etat);
    const [cote1, cote2] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test', version: '1.0.0' });
    await Promise.all([serveur.connect(cote2), client.connect(cote1)]);
  });
  afterAll(async () => {
    await client.close();
    etat.db?.close();
  });

  it('démarre sans espace : outils en erreur claire, prompt de démarrage qui propose de le créer', async () => {
    expect(etat.db).toBeNull();
    expect(existsSync(espace)).toBe(false);
    const etatEspace = json(await appeler('etat_espace'));
    expect(etatEspace).toMatchObject({ initialise: false, demarrage_fait: false });
    for (const [outil, args] of [
      ['lire_fichier', { chemin: 'AGENTS.md' }],
      ['ecrire_fichier', { chemin: '_CONTEXTE.md', contenu: 'x' }],
      ['lister_offres', {}],
      ['grille', {}],
    ] as const) {
      const r = (await appeler(outil, args)) as Resultat;
      expect(r.isError, outil).toBe(true);
      expect(texte(r)).toMatch(/Espace non initialisé.*initialiser_espace/);
    }
    expect(existsSync(espace)).toBe(false);
    const p = await client.getPrompt({ name: 'demarrage' });
    expect(textePrompt(p)).toMatch(/initialiser_espace/);
    const autre = await client.getPrompt({ name: 'traiter-emails' });
    expect(textePrompt(autre)).toMatch(/prompt « demarrage »/);
  });

  it('liste les prompts des consignes de l’espace', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual(['cv-cible', 'demarrage', 'preparer-go', 'traiter-emails']);
    expect(prompts.find((p) => p.name === 'cv-cible')!.arguments?.map((a) => a.name)).toEqual(['offre']);
  });

  it('initialiser_espace crée l’espace et le serveur s’y installe', async () => {
    const dansApp = (await appeler('initialiser_espace', { dossier: join(RACINE, 'essai-espace') })) as Resultat;
    expect(dansApp.isError).toBe(true);
    expect(texte(dansApp)).toMatch(/dossier de l'application/);

    const r = json(await appeler('initialiser_espace', {}));
    expect(r.ok).toBe(true);
    expect(r.dossier).toBe(espace.replace(/\\/g, '/'));
    expect(r.avertissements as string[]).not.toEqual(expect.arrayContaining([expect.stringMatching(/POSTULER_JUSTE_DATA/)]));
    expect(existsSync(join(espace, 'AGENTS.md'))).toBe(true);
    expect(etat.db).not.toBeNull();
    expect(json(await appeler('lister_offres'))).toMatchObject({ total: 0 });
    expect(json(await appeler('grille'))).toMatchObject({ version: 1 });

    const encore = (await appeler('initialiser_espace', {})) as Resultat;
    expect(encore.isError).toBe(true);
    expect(texte(encore)).toMatch(/existe déjà/);
  });

  it('les prompts lisent les consignes sur le disque à chaque appel', async () => {
    const p = textePrompt(await client.getPrompt({ name: 'demarrage' }));
    expect(p).toContain('AGENTS.md');
    expect(p).toContain("# Consignes pour l'IA");
    expect(p).toContain('# Démarrage — consignes pour l');
    expect(p).toContain(espace.replace(/\\/g, '/')); // marqueurs {{ESPACE}} remplacés par init
    expect(p).not.toMatch(/\{\{\w+\}\}/);
    expect(p).toMatch(/lire_fichier/);

    appendFileSync(join(espace, 'procedures', 'traiter-emails.md'), '\nConsigne ajoutée par l’utilisateur : trier par date.\n');
    const t = textePrompt(await client.getPrompt({ name: 'traiter-emails' }));
    expect(t).toContain('Consigne ajoutée par l’utilisateur : trier par date.');
    expect(t).toContain('# Procédure : traiter les e-mails');

    const cv = textePrompt(await client.getPrompt({ name: 'cv-cible', arguments: { offre: '#12 Acme' } }));
    expect(cv).toContain('# Procédure : CV ciblé');
    expect(cv).toContain('Offre visée : #12 Acme');
    expect(textePrompt(await client.getPrompt({ name: 'preparer-go' }))).toContain('# Procédure : préparer les candidatures');
  });

  it('expose AGENTS.md comme ressource', async () => {
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain('postuler-juste://espace/AGENTS.md');
    const r = await client.readResource({ uri: 'postuler-juste://espace/AGENTS.md' });
    expect((r.contents[0] as { text: string }).text).toContain('Règles non négociables');
  });

  it('écrit puis relit, signale un remplacement, refuse les chemins hors espace et data/', async () => {
    const premiere = json(await appeler('ecrire_fichier', { chemin: 'candidatures/acme/dossier-candidature.md', contenu: '# Acme\n' }));
    expect(premiere).toMatchObject({ existait: false });
    expect(texte(await appeler('lire_fichier', { chemin: 'candidatures/acme/dossier-candidature.md' }))).toBe('# Acme\n');
    const contexte = json(await appeler('ecrire_fichier', { chemin: '_CONTEXTE.md', contenu: '# Contexte\n' }));
    expect(contexte.existait).toBe(true);
    expect(contexte.ancienne_taille as number).toBeGreaterThan(100);

    for (const chemin of ['../dehors.md', 'data/x.md', join(racine, 'dehors.md'), '.mcp.json']) {
      const r = (await appeler('ecrire_fichier', { chemin, contenu: 'x' })) as Resultat;
      expect(r.isError, chemin).toBe(true);
    }
    expect(existsSync(join(racine, 'dehors.md'))).toBe(false);
    const lu = (await appeler('lire_fichier', { chemin: 'data/postuler-juste.sqlite' })) as Resultat;
    expect(lu.isError).toBe(true);

    const liste = json(await appeler('lister_fichiers', { dossier: 'candidatures', profondeur: 2 }));
    expect((liste.entrees as { chemin: string }[]).map((e) => e.chemin)).toContain('candidatures/acme/dossier-candidature.md');
    expect(json(await appeler('deplacer_fichier', { source: 'candidatures/acme/dossier-candidature.md', destination: 'candidatures/acme-dev/dossier-candidature.md' }))).toMatchObject({ ok: true });
  });

  it('lit le texte d’un PDF déposé et renvoie une image comme image', async () => {
    copyFileSync(join(RACINE, 'docs', 'exemples', 'CV-exemple-sobre.pdf'), join(espace, 'a-deposer', 'CV.pdf'));
    const pdf = texte(await appeler('lire_fichier', { chemin: 'a-deposer/CV.pdf' }));
    expect(pdf).toMatch(/PDF, 2 page\(s\), texte extrait/);
    expect(pdf).toContain('Thomas RENAUD');
    expect(pdf).toContain('----- page 2 / 2 -----');

    copyFileSync(join(RACINE, 'docs', 'captures', readdirPng()), join(espace, 'a-deposer', 'capture.png'));
    const img = (await appeler('lire_fichier', { chemin: 'a-deposer/capture.png' })) as Resultat;
    expect(img.content.map((c) => c.type)).toEqual(['text', 'image']);
    expect(img.content[1].mimeType).toBe('image/png');
  });

  it('compte les caractères d’un texte ou d’un fichier, liste et choisit les gabarits', async () => {
    expect(json(await appeler('compter', { texte: 'Bonjour à vous' }))).toMatchObject({ blocs: [{ caracteres: 14, mots: 3 }] });
    const f = json(await appeler('compter', { chemin: 'candidatures/acme-dev/dossier-candidature.md' }));
    expect(f).toMatchObject({ fichier: 'candidatures/acme-dev/dossier-candidature.md', blocs: [{ caracteres: 6 }] });
    expect((await appeler('compter', {}) as Resultat).isError).toBe(true);

    const g = json(await appeler('lister_gabarits')) as { gabarits: { nom: string }[] };
    expect(g.gabarits.map((x) => x.nom)).toEqual(expect.arrayContaining(['sobre', 'moderne', 'compact']));
    const c = json(await appeler('choisir_gabarit', { nom: 'moderne' }));
    expect(c).toMatchObject({ ok: true, dossier: 'cv/gabarit' });
    expect(c.ancien).toMatch(/^cv\/gabarit-\d{8}-\d{6}$/);
    expect(readFileSync(join(espace, 'cv', 'gabarit', 'gabarit.css'), 'utf8')).toMatch(/bandeau|moderne/i);
  });
});

/** Une capture PNG livrée dans docs/captures. */
function readdirPng(): string {
  return readdirSync(join(RACINE, 'docs', 'captures')).find((n) => n.endsWith('.png'))!;
}

describe('serveur MCP autonome (stdio, bout à bout)', () => {
  const espace = join(racine, 'essai-stdio');
  let client: Client;
  const appeler = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });

  beforeAll(async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(RACINE, 'bin', 'postuler-juste.js'), 'mcp'],
      cwd: racine,
      env: { ...(process.env as Record<string, string>), POSTULER_JUSTE_CONFIG: '', POSTULER_JUSTE_DATA: espace },
      stderr: 'pipe',
    });
    client = new Client({ name: 'essai', version: '1.0.0' });
    await client.connect(transport);
  }, 30_000);
  afterAll(async () => {
    await client?.close();
  });

  it('initialize → prompts → initialiser_espace → écrire / lire → generer_cv avec capture', async () => {
    expect(client.getServerCapabilities()).toMatchObject({ tools: {}, prompts: {}, resources: {} });
    expect(client.getInstructions()).toMatch(/initialiser_espace/);
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain('demarrage');
    expect(textePrompt(await client.getPrompt({ name: 'demarrage' }))).toMatch(/initialiser_espace/);
    const { tools } = await client.listTools();
    expect(tools.length).toBe(32);

    expect(json(await appeler('initialiser_espace'))).toMatchObject({ ok: true });
    expect(textePrompt(await client.getPrompt({ name: 'demarrage' }))).toContain('# Démarrage — consignes pour l');
    expect(json(await appeler('ecrire_fichier', { chemin: 'a-deposer/notes.md', contenu: 'Mes notes\n' }))).toMatchObject({ existait: false });
    expect(texte(await appeler('lire_fichier', { chemin: 'a-deposer/notes.md' }))).toBe('Mes notes\n');

    if (!trouverNavigateur()) return; // pas de Chrome / Edge : la génération du PDF ne peut pas être essayée ici
    const r = (await appeler('generer_cv', { chemin: 'cv/_exemple-structure.md', capture: true })) as Resultat;
    expect(r.isError, texte(r)).toBeFalsy();
    const infos = JSON.parse(r.content[0].text!) as Record<string, unknown>;
    expect(infos).toMatchObject({ ok: true, pdf: 'cv/_exemple-structure.pdf', pages: 2, depasse_2_pages: false, pdf_existait: false, gabarit: 'cv/gabarit' });
    expect(existsSync(join(espace, 'cv', '_exemple-structure.pdf'))).toBe(true);
    // Remplissage mesuré sur le PDF réel : une valeur en % par page.
    expect(infos.remplissage).toHaveLength(2);
    for (const p of infos.remplissage as string[]) expect(p).toMatch(/^page \d : \d{1,3} %$/);
    expect(Array.isArray(infos.avertissements)).toBe(true);
    expect(r.content[1]).toMatchObject({ type: 'image', mimeType: 'image/png' });
    expect(Buffer.from(r.content[1].data!, 'base64').subarray(1, 4).toString()).toBe('PNG');
  }, 90_000);
});
