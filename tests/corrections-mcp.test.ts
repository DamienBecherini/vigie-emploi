// Corrections issues de la simulation « client MCP seul » : réponses plafonnées, exemples de la grille dans
// modifier_grille, remplissage des pages du CV, e-mails supprimés et erreurs d'ingestion annoncés.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ouvrirBase, transaction, type Base } from '../src/db/base.ts';
import { enregistrerOffre } from '../src/core/offres.ts';
import { offresALire } from '../src/core/actions.ts';
import { appliquerChangement, exemplesCalcules } from '../src/core/grille.ts';
import { EXEMPLE_GRILLE, initialiserGrille, lireFichierGrille, modifierGrille } from '../src/core/grille-stockage.ts';
import { remplissage, SEUIL_PAGE_PLEINE } from '../src/cv/pages.ts';
import { presenterIngestion, REPONSE_MAX } from '../src/mcp/presentation.ts';
import { creerServeurMcp } from '../src/mcp/serveur.ts';
import { ouvrirEtat } from '../src/mcp/etat.ts';
import type { ResumeIngest } from '../src/ingest/ingest.ts';
import { initialiserEspace } from '../src/init/init.ts';

const DESCRIPTION = 'Développement PHP et API REST, maintenance de sites WordPress, revue de code. '.repeat(40); // ≈ 3 000 caractères

function remplirBase(db: Base, n: number): void {
  transaction(db, () => {
    for (let i = 1; i <= n; i++) {
      enregistrerOffre(
        db,
        i % 2 ? 'hellowork' : 'linkedin',
        String(900000 + i),
        {
          titre: `Développeur back-end PHP senior pour une plateforme de services numériques n° ${i}`,
          entreprise: `Entreprise ${i}`,
          lieu: 'Paris (75)',
          url_canonique: `https://exemple.org/offres/${900000 + i}`,
          description: i % 2 ? DESCRIPTION : null,
          recue_le: '2026-11-12',
        },
        'email',
      );
    }
  });
}

describe('offres à lire : résumé paginé', () => {
  let db: Base;
  beforeAll(() => {
    db = ouvrirBase(':memory:');
    remplirBase(db, 500);
  });

  it('résumé sans description, page, restantes', () => {
    const r = offresALire(db, { limite: 25, descriptions: false });
    expect(r).toMatchObject({ total: 500, page: 1, pages: 20, restantes: 475 });
    expect(r.offres).toHaveLength(25);
    expect(r.offres[0]).not.toHaveProperty('description');
    expect(r.offres[0].longueur_description).toBe(DESCRIPTION.trim().length);
    expect(r.offres[1]).toMatchObject({ longueur_description: 0, lecture: 'navigateur' });
    const derniere = offresALire(db, { limite: 25, page: 20, descriptions: false });
    expect(derniere).toMatchObject({ page: 20, restantes: 0 });
    expect(derniere.offres.at(-1)!.id).toBe(500);
  });

  it('descriptions tronquées à la longueur demandée ; CLI inchangée (descriptions par défaut)', () => {
    const r = offresALire(db, { limite: 2, longueur: 100 });
    expect(r.offres[0].description!.length).toBe(100);
    expect(offresALire(db, { limite: 1 }).offres[0].description!.length).toBe(2500);
  });
});

describe('serveur MCP : réponses de taille raisonnable', () => {
  let dossier: string;
  let client: Client;
  let db: Base;

  const appeler = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { type: string; text: string }[] };
    return { texte: r.content[0].text, erreur: Boolean(r.isError) };
  };

  beforeAll(async () => {
    const racine = mkdtempSync(join(tmpdir(), 'postuler-juste-plafonds-'));
    dossier = join(racine, 'espace');
    initialiserEspace({ dossier });
    const etat = ouvrirEtat({ dossierDonnees: dossier, env: {}, cwd: racine });
    db = etat.db!;
    remplirBase(db, 500);
    dossier = racine;
    const serveur = creerServeurMcp(etat);
    const [a, b] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test', version: '1.0.0' });
    await Promise.all([serveur.connect(a), client.connect(b)]);
  });

  afterAll(async () => {
    await client?.close();
    db?.close();
    rmSync(dossier, { recursive: true, force: true });
  });

  it('offres_a_lire, lister_offres, lire_offre, grille restent sous le plafond', async () => {
    const aLire = await appeler('offres_a_lire');
    const r = JSON.parse(aLire.texte);
    expect(r).toMatchObject({ total: 500, restantes: 475 });
    expect(r.offres).toHaveLength(25);
    expect(r.suite).toMatch(/page: 2/);
    expect(r.offres[0]).not.toHaveProperty('description');

    const avec = JSON.parse((await appeler('offres_a_lire', { descriptions: true, limite: 50 })).texte);
    expect(avec.offres).toHaveLength(10);
    expect(avec.offres[0].description.length).toBeLessThanOrEqual(1500);

    for (const [outil, args] of [
      ['offres_a_lire', {}],
      ['offres_a_lire', { limite: 60 }],
      ['offres_a_lire', { descriptions: true }],
      ['lister_offres', {}],
      ['lister_offres', { taille: 60 }],
      ['lire_offre', { id: 1 }],
      ['grille', {}],
    ] as const) {
      const { texte, erreur } = await appeler(outil, args);
      expect(erreur, `${outil} ${JSON.stringify(args)}`).toBe(false);
      expect(texte.length, `${outil} ${JSON.stringify(args)}`).toBeLessThan(REPONSE_MAX);
    }
    expect((await appeler('lister_offres', { taille: 500 })).erreur).toBe(true);
  });

  it('lire_offre coupe une description très longue, sauf complet', async () => {
    const { offre } = enregistrerOffre(db, 'manuel', 'long', { titre: 'Longue', description: 'x'.repeat(40_000) }, 'manuel');
    const court = JSON.parse((await appeler('lire_offre', { id: offre.id })).texte);
    expect(court.description.length).toBeLessThan(16_000);
    expect(court.description_tronquee).toMatch(/complet: true/);
    const complet = JSON.parse((await appeler('lire_offre', { id: offre.id, complet: true })).texte);
    expect(complet.description.length).toBe(40_000);
  });

  it('modifier_grille en essai renvoie les exemples recalculés, et accepte des exemples', async () => {
    const essai = JSON.parse((await appeler('modifier_grille', { essai: true, changement: { poids: { technique: 90 } } })).texte);
    expect(essai.enregistree).toBe(false);
    expect(essai.exemples_calcules.length).toBeGreaterThan(0);
    expect(essai.exemples_calcules[0]).toHaveProperty('avant');
    expect(essai.exemples_calcules[0]).toHaveProperty('moyenne_avant');
    expect(essai.exemples_calcules.some((e: { moyenne: number; moyenne_avant: number }) => e.moyenne !== e.moyenne_avant)).toBe(true);

    const ajout = JSON.parse(
      (
        await appeler('modifier_grille', {
          essai: true,
          changement: { exemples: { ajouter: [{ titre: 'Offre réelle', criteres: { technique: { note: 9, justification: 'PHP' } }, commentaire: 'bonne' }] } },
        })
      ).texte,
    );
    expect(ajout.exemples_calcules.at(-1)).toMatchObject({ titre: 'Offre réelle', avant: null });
  });
});

describe('grille : exemples dans le changement partiel', () => {
  const g = () => lireFichierGrille(EXEMPLE_GRILLE)!.grille;

  it('ajoute, remplace (même titre et entreprise, sans casse) et retire', () => {
    const base = g();
    const n = base.exemples.length;
    const premier = base.exemples[0];
    const ajoute = appliquerChangement(base, { exemples: { ajouter: [{ titre: 'Nouvelle', criteres: {}, commentaire: '' }] } });
    expect(ajoute.exemples).toHaveLength(n + 1);
    const remplace = appliquerChangement(base, {
      exemples: { ajouter: [{ ...premier, titre: premier.titre.toUpperCase(), commentaire: 'remplacé' }] },
    });
    expect(remplace.exemples).toHaveLength(n);
    expect(remplace.exemples[0].commentaire).toBe('remplacé');
    const retire = appliquerChangement(base, { exemples: { retirer: [premier.titre] } });
    expect(retire.exemples.map((e) => e.titre)).not.toContain(premier.titre);
    expect(() => appliquerChangement(base, { exemples: { retirer: ['Inconnu'] } })).toThrow(/Exemple absent/);
    expect(() =>
      appliquerChangement(base, { exemples: { ajouter: [{ titre: 'X', criteres: { inconnu: { note: 5, justification: '' } } }] } }),
    ).toThrow(/critère IA inconnu/);
    expect(base.exemples).toHaveLength(n); // grille d'origine intacte
  });

  it('modifierGrille (CLI et MCP) : exemples recalculés en essai et après enregistrement, base vide', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'postuler-juste-exemples-'));
    const db = ouvrirBase(':memory:');
    initialiserGrille(db, dossier);
    const essai = modifierGrille(db, dossier, { poids: { technique: 90 } }, { auteur: 'cli', resume: '', essai: true });
    expect(essai.impact.offres_recalculees).toBe(0);
    expect(essai.exemples_calcules).toEqual(exemplesCalcules(essai.grille, null, { grille: g(), version: 1 }));
    const enr = modifierGrille(db, dossier, { exemples: { retirer: [g().exemples[0].titre] } }, { auteur: 'cli', resume: 'retrait' });
    expect(enr.enregistree).toBe(true);
    expect(enr.exemples_calcules).toHaveLength(g().exemples.length - 1);
    db.close();
    rmSync(dossier, { recursive: true, force: true });
  });
});

describe('remplissage des pages du CV', () => {
  const page = (haut: number, bas: number) => ({ hauteur: 842, texte: { haut, bas } });

  it('deux pages pleines : aucun avertissement', () => {
    const a = remplissage([page(30, 812), page(30, 790)]);
    expect(a.pages.map((p) => p.remplissage)).toEqual([100, 97]);
    expect(a.avertissements).toEqual([]);
  });

  it('page 1 à moitié vide avant la page 2 : saut de page mal placé', () => {
    const a = remplissage([page(30, 520), page(30, 812)]);
    expect(a.pages[0].remplissage).toBeLessThan(SEUIL_PAGE_PLEINE);
    expect(a.avertissements.join(' ')).toMatch(/Page 1 .*saut de page/);
  });

  it('dernière page trop vide : avertissement ; à moitié : simple remarque', () => {
    expect(remplissage([page(30, 812), page(30, 300)]).avertissements.join(' ')).toMatch(/Dernière page \(2\).*beaucoup de vide/);
    const r = remplissage([page(30, 812), page(30, 500)]);
    expect(r.pages[1].remplissage).toBe(60);
    expect(r.avertissements.join(' ')).toMatch(/^Remarque : dernière page \(2\) remplie à 60 %/);
  });

  it('une seule page : pas d’avertissement de dernière page ; page sans texte : 0 %', () => {
    expect(remplissage([page(30, 400)]).avertissements).toEqual([]);
    expect(remplissage([page(30, 812), { hauteur: 842, texte: null }]).pages[1].remplissage).toBe(0);
  });
});

describe('ingerer_emails : ce qu’il faut dire à l’utilisateur', () => {
  const resume = (x: Partial<ResumeIngest>): ResumeIngest => ({
    fichiers: 3,
    fichiers_supprimes: 3,
    offres_trouvees: 2,
    nouvelles: 2,
    doublons: 0,
    ecartees: 0,
    a_lire: 1,
    avec_description: 1,
    erreurs: [],
    sans_offre: [],
    confirmations: [],
    detail: {
      nouvelles: [
        { id: 7, source: 'hellowork', url: 'https://www.hellowork.com/fr-fr/emplois/1.html', titre: 'Dev PHP', entreprise: 'A', statut: 'nouvelle', a_description: false },
        { id: 8, source: 'linkedin', url: 'https://www.linkedin.com/jobs/view/2/', titre: 'Dev', entreprise: 'B', statut: 'nouvelle', a_description: false },
      ],
      ecartees: [],
      doublons: [],
    },
    ...x,
  });

  it('annonce les .eml supprimés et les erreurs, avec l’offre concernée', () => {
    const r = presenterIngestion(
      resume({ erreurs: [{ url: 'https://www.hellowork.com/fr-fr/emplois/1.html', message: 'JSON-LD JobPosting absent de la page' }] }),
    ) as { a_dire: string[]; erreurs: { offre: number }[] };
    expect(r.a_dire[0]).toMatch(/Les 3 fichier\(s\) \.eml traité\(s\) ont été supprimés de emails\//);
    expect(r.a_dire.join(' ')).toMatch(/1 erreur\(s\) d'ingestion, à signaler à l'utilisateur/);
    expect(r.erreurs[0]).toMatchObject({ offre: 7, message: 'JSON-LD JobPosting absent de la page' });
  });

  it('garder: true : e-mails conservés ; détail plafonné', () => {
    const beaucoup = Array.from({ length: 200 }, (_, i) => ({ id: i, source: 'linkedin', url: `u${i}`, titre: `T${i}`, entreprise: null, statut: 'nouvelle' }));
    const r = presenterIngestion(resume({ fichiers_supprimes: 0, detail: { nouvelles: beaucoup, ecartees: [], doublons: [] } }), { garder: true }) as {
      a_dire: string[];
      detail: { nouvelles: unknown[]; nouvelles_non_affichees: number };
    };
    expect(r.a_dire[0]).toMatch(/conservés dans emails\//);
    expect(r.detail.nouvelles).toHaveLength(30);
    expect(r.detail.nouvelles_non_affichees).toBe(170);
    expect(JSON.stringify(r).length).toBeLessThan(REPONSE_MAX);
  });
});
