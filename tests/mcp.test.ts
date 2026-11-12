// Lance le vrai serveur MCP (node bin/postuler-juste.js mcp, transport stdio) et appelle ses outils comme une IA.
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
    dossier = mkdtempSync(join(tmpdir(), 'postuler-juste-mcp-'));
    cpSync(join(FIXTURES, 'donnees'), dossier, { recursive: true });
    cpSync(join(FIXTURES, 'emails'), join(dossier, 'emails'), { recursive: true });
    // cwd = dossier temporaire : la configuration personnelle éventuelle du dépôt n'est pas lue.
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(RACINE, 'bin', 'postuler-juste.js'), 'mcp', '--data', dossier],
      cwd: dossier,
      env: { ...(process.env as Record<string, string>), POSTULER_JUSTE_CONFIG: '' },
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
        'ajouter_evenement',
        'candidater',
        'changer_statut',
        'echeances',
        'enregistrer_candidature',
        'fichiers_dossier',
        'generer_suivi',
        'grille',
        'historique_grille',
        'ingerer_emails',
        'journal',
        'lire_offre',
        'marquer_fait',
        'modifier_evenement',
        'lister_offres',
        'modifier_lien',
        'modifier_tags',
        'noter_lot',
        'noter_offre',
        'offres_a_lire',
        'modifier_grille',
        'renoter',
        // Espace, fichiers et CV (client MCP sans accès aux fichiers)
        'etat_espace',
        'initialiser_espace',
        'lister_fichiers',
        'lire_fichier',
        'ecrire_fichier',
        'deplacer_fichier',
        'generer_cv',
        'compter',
        'lister_gabarits',
        'choisir_gabarit',
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

    // Journal : l'appel raconté par l'utilisateur, puis la prochaine échéance.
    const ev = (await appeler('ajouter_evenement', {
      id,
      type: 'entretien',
      le: '02/11/2026 11:00',
      resume: 'Appel avec la RH : périmètre et salaire',
      canal: 'Téléphone',
    })) as unknown as { evenement: { id: number; fait: boolean } };
    expect(ev.evenement.fait).toBe(true);
    const ech = (await appeler('ajouter_evenement', { id, type: 'message', sens: 'envoye', le: '+3', resume: 'Relancer la RH' })) as unknown as {
      evenement: { id: number; fait: boolean };
    };
    expect(ech.evenement.fait).toBe(false);
    const prochaines = (await appeler('echeances', { jours: 7 })) as unknown as { a_venir: { id: number; offre_id: number }[] };
    expect(prochaines.a_venir).toEqual([expect.objectContaining({ id: ech.evenement.id, offre_id: id })]);
    const j = (await appeler('journal', { id })) as unknown as { evenements: { id: number }[] };
    expect(j.evenements.map((e) => e.id)).toEqual([ech.evenement.id, ev.evenement.id]);
    expect(((await appeler('marquer_fait', { evenement_id: ech.evenement.id })) as { evenement: { fait: boolean } }).evenement.fait).toBe(true);
    expect((await appeler('modifier_evenement', { evenement_id: ev.evenement.id, interlocuteurs: 'Julie (RH)' })).evenement).toMatchObject({
      interlocuteurs: 'Julie (RH)',
    });
    const f = (await appeler('fichiers_dossier', { id })) as unknown as { dossier: string; existe: boolean };
    expect(f).toMatchObject({ dossier: c.dossier_suggere, existe: false });
    expect((await appeler('ajouter_evenement', { id, type: 'note', resume: 'x', le: 'bientôt' })).erreur).toMatch(/Date invalide/);

    const s = (await appeler('generer_suivi')) as unknown as { fichier: string; en_cours: number };
    expect(s.fichier).toBe(join(dossier, 'candidatures', '_SUIVI.genere.md'));
    expect(existsSync(s.fichier)).toBe(true);
    expect(s.en_cours).toBe(1);
  }, 30_000);

  it('grille : lire, noter à critères, modifier (essai puis enregistrement), renoter, historique', async () => {
    expect((await appeler('grille')).erreur).toMatch(/Pas de grille/);
    cpSync(join(RACINE, 'exemples', 'grille.json'), join(dossier, 'profil', 'grille.json'));
    const g = (await appeler('grille')) as unknown as { version: number; consignes_ia: string[]; exemples_calcules: { note: number }[] };
    expect(g.version).toBe(1);
    expect(g.consignes_ia.join(' ')).toMatch(/Ne donne pas la note finale/);
    expect(g.exemples_calcules.map((e) => e.note)).toEqual([8, 3.5, 0]);

    const aLire = (await appeler('lister_offres', { taille: 2 })) as unknown as { offres: { id: number }[] };
    const [a, b] = aLire.offres.map((o) => o.id);
    const lot = (await appeler('noter_lot', {
      offres: [
        { id: a, note: 2, criteres: { technique: { note: 8, justification: 'PHP' }, role: { note: 7 }, interet: { note: 6 }, risque: { note: 7 } }, entrees: { jours_sur_site: 1, salaire_min: 55000, salaire_max: 60000, unite: 'an' } },
        { id: b, criteres: { technique: { note: 9 } }, bloquants: ['stage'] },
      ],
    })) as unknown as { offres: { note: number; avertissements?: string[]; decomposition: { criteres: unknown[] } }[] };
    // 8×.35 + 8×.2 + (57,5 K€ : 5 + 5×17,5/20 = 9,375)×.2 + 7×.1 + 6×.1 + 7×.05 = 7,925 → 8
    expect(lot.offres[0].note).toBe(8);
    expect(lot.offres[0].avertissements?.[0]).toMatch(/ignoré/);
    expect(lot.offres[0].decomposition.criteres).toHaveLength(6);
    expect(lot.offres[1].note).toBe(0);
    expect((await appeler('noter_offre', { id: a, criteres: { teletravail: { note: 3 } } })).erreur).toMatch(/calculé/);
    expect((await appeler('noter_offre', { id: a, criteres: { technique: { note: 3 } }, bloquants: ['armee'] })).erreur).toMatch(/Règle bloquante inconnue/);

    const essai = (await appeler('modifier_grille', { changement: { regles: [{ id: 'stage', actif: false }] }, essai: true })) as unknown as {
      enregistree: boolean;
      impact: { montent: { id: number }[] };
    };
    expect(essai.enregistree).toBe(false);
    expect(essai.impact.montent.map((x) => x.id)).toEqual([b]);
    expect((await appeler('modifier_grille', { changement: { seuil: 5 } })).erreur).toMatch(/resume/);
    const m = (await appeler('modifier_grille', { changement: { regles: [{ id: 'stage', actif: false }] }, resume: 'Stages acceptés' })) as unknown as {
      version: number;
    };
    expect(m.version).toBe(2);
    expect(((await appeler('lire_offre', { id: b })) as unknown as { note: number }).note).toBeGreaterThan(0);
    expect(await appeler('renoter')).toMatchObject({ ok: true, version: 2, impact: { offres_recalculees: 2, changees: 0 } });
    const r = (await appeler('modifier_grille', { restaurer_version: 1 })) as unknown as { version: number };
    expect(r.version).toBe(3);
    const h = (await appeler('historique_grille')) as unknown as { versions: { version: number; auteur: string; resume: string }[] };
    expect(h.versions.map((x) => [x.version, x.auteur, x.resume])).toEqual([
      [3, 'mcp', 'Retour à la version 1'],
      [2, 'mcp', 'Stages acceptés'],
      [1, 'fichier', "Grille d'exemple de postuler-juste (à adapter)"],
    ]);
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
