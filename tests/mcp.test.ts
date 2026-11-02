// Lance le vrai serveur MCP (node bin/cap-emploi.js mcp, transport stdio) et appelle ses outils comme une IA.
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const RACINE = join(import.meta.dirname, '..');
const FIXTURES = join(import.meta.dirname, 'fixtures');

type Resultat = { isError?: boolean; content: { type: string; text: string }[] };

describe('serveur MCP (stdio)', () => {
  let dossier: string;
  let client: Client;

  const appeler = async (name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
    const r = (await client.callTool({ name, arguments: args })) as Resultat;
    if (r.isError) return { erreur: r.content[0].text };
    return JSON.parse(r.content[0].text) as Record<string, unknown>;
  };

  beforeAll(async () => {
    dossier = mkdtempSync(join(tmpdir(), 'cap-emploi-mcp-'));
    cpSync(join(FIXTURES, 'donnees'), dossier, { recursive: true });
    cpSync(join(FIXTURES, 'emails'), join(dossier, 'emails'), { recursive: true });
    // cwd = dossier temporaire : la configuration personnelle éventuelle du dépôt n'est pas lue.
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(RACINE, 'bin', 'cap-emploi.js'), 'mcp', '--data', dossier],
      cwd: dossier,
      env: { ...(process.env as Record<string, string>), CAP_EMPLOI_CONFIG: '' },
      stderr: 'pipe',
    });
    client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(transport);
  }, 30_000);

  afterAll(async () => {
    await client?.close();
    rmSync(dossier, { recursive: true, force: true });
  });

  it('expose les outils attendus, décrits en français', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'candidater',
        'changer_statut',
        'enregistrer_candidature',
        'generer_suivi',
        'ingerer_emails',
        'lire_offre',
        'lister_offres',
        'modifier_lien',
        'modifier_tags',
        'noter_lot',
        'noter_offre',
        'offres_a_lire',
      ].sort(),
    );
    const noter = tools.find((t) => t.name === 'noter_offre')!;
    expect(noter.description).toMatch(/historique/);
    expect(Object.keys(noter.inputSchema.properties ?? {})).toEqual(expect.arrayContaining(['id', 'url', 'note', 'colle', 'ecarts']));
  });

  it('flux complet : ingérer → lire → noter → candidater → enregistrer → générer le suivi', async () => {
    const ing = await appeler('ingerer_emails', { garder: true, telecharger: false });
    expect(ing.nouvelles).toBeGreaterThan(0);
    expect(readdirSync(join(dossier, 'emails')).length).toBe(4); // garder : e-mails conservés

    const aLire = (await appeler('offres_a_lire', { limite: 3 })) as unknown as { total: number; offres: { id: number; lecture: string }[] };
    expect(aLire.offres.length).toBeGreaterThan(0);
    const id = aLire.offres[0].id;

    const n = await appeler('noter_offre', { id, note: 6, note_brute: 6.5, penalites: '-0,5 trajet', colle: 'PHP', ecarts: 'sur site', lu: true });
    expect(n).toMatchObject({ ok: true, id, note: 6, statut: 'notee' });
    const lot = await appeler('noter_lot', { offres: [{ id: aLire.offres[1].id, note: 3, ecarts: 'hors cible' }] });
    expect(lot).toMatchObject({ ok: true, notees: 1 });

    const liste = (await appeler('lister_offres', { statuts: ['notee'], note_min: 5, tri: 'note' })) as unknown as { offres: { id: number }[] };
    expect(liste.offres.map((o) => o.id)).toContain(id);

    const tags = await appeler('modifier_tags', { id, ajouter: ['a-relancer'] });
    expect(tags).toMatchObject({ tags: ['a-relancer'] });

    const c = (await appeler('candidater', { id })) as unknown as { dossier_suggere: string; offre: { statut: string } };
    expect(c.offre.statut).toBe('go');
    expect(c.dossier_suggere).toMatch(/^candidatures\//);

    const e = await appeler('enregistrer_candidature', {
      id,
      dossier: c.dossier_suggere,
      canal: 'LinkedIn',
      envoyee_le: '02/11/2026',
      prochaine_action: 'Relancer le 09/11',
    });
    expect(e).toMatchObject({ ok: true, statut: 'envoyee', statut_ajoute: 'envoyee' });

    const detail = (await appeler('lire_offre', { id })) as unknown as { candidature: { prochaine_action: string; envoyee_le: string } };
    expect(detail.candidature).toMatchObject({ prochaine_action: 'Relancer le 09/11', envoyee_le: '2026-11-02' });

    const s = (await appeler('generer_suivi')) as unknown as { fichier: string; en_cours: number };
    expect(s.fichier).toBe(join(dossier, 'candidatures', '_SUIVI.genere.md'));
    expect(existsSync(s.fichier)).toBe(true);
    expect(s.en_cours).toBe(1);
  }, 30_000);

  it('erreurs renvoyées à l’IA sans arrêter le serveur', async () => {
    expect((await appeler('lire_offre', { id: 999999 })).erreur).toMatch(/introuvable/);
    expect((await appeler('noter_offre', { note: 5 })).erreur).toMatch(/id.*url/);
    expect((await appeler('modifier_lien', { id: 1, url: 'pas-un-lien' })).erreur).toMatch(/Lien invalide/);
    const r = (await client.callTool({ name: 'changer_statut', arguments: { id: 1, statut: 'inconnu' } })) as Resultat;
    expect(r.isError).toBe(true);
    expect((await appeler('changer_statut', { id: 1, statut: 'ecartee', commentaire: 'hors cible' })).statut).toBe('ecartee');
  });
});
