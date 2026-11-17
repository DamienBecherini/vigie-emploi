// Fixes from the "MCP client only" simulation: capped responses, rubric examples in
// update_rubric, fill of the CV pages, deleted e-mails and ingestion errors announced.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { openDatabase, transaction, type Database } from '../src/db/database.ts';
import { saveOffer } from '../src/core/offers.ts';
import { offersToRead } from '../src/core/actions.ts';
import { applyChange, computedExamples } from '../src/core/rubric.ts';
import { EXAMPLE_RUBRIC, initializeRubric, readFileRubric, updateRubric } from '../src/core/rubric-storage.ts';
import { fill, THRESHOLD_PAGE_FULL } from '../src/cv/pages.ts';
import { presentIngestion, REPLY_MAX } from '../src/mcp/presentation.ts';
import { createServerMcp } from '../src/mcp/server.ts';
import { openState } from '../src/mcp/state.ts';
import type { SummaryIngest } from '../src/ingest/ingest.ts';
import { initializeWorkspace } from '../src/init/init.ts';

const DESCRIPTION = 'Développement PHP et API REST, maintenance de sites WordPress, revue de code. '.repeat(40); // ≈ 3,000 characters

function fillDatabase(db: Database, n: number): void {
  transaction(db, () => {
    for (let i = 1; i <= n; i++) {
      saveOffer(
        db,
        i % 2 ? 'hellowork' : 'linkedin',
        String(900000 + i),
        {
          title: `Développeur back-end PHP senior pour une plateforme de services numériques n° ${i}`,
          company: `Entreprise ${i}`,
          location: 'Paris (75)',
          canonical_url: `https://example.org/offers/${900000 + i}`,
          description: i % 2 ? DESCRIPTION : null,
          received_at: '2026-11-12',
        },
        'email',
      );
    }
  });
}

describe('offers to read: paginated summary', () => {
  let db: Database;
  beforeAll(() => {
    db = openDatabase(':memory:');
    fillDatabase(db, 500);
  });

  it('summary without description, page, remaining', () => {
    const r = offersToRead(db, { limit: 25, descriptions: false });
    expect(r).toMatchObject({ total: 500, page: 1, pages: 20, remaining: 475 });
    expect(r.offers).toHaveLength(25);
    expect(r.offers[0]).not.toHaveProperty('description');
    expect(r.offers[0].length_description).toBe(DESCRIPTION.trim().length);
    expect(r.offers[1]).toMatchObject({ length_description: 0, reading: 'browser' });
    const last = offersToRead(db, { limit: 25, page: 20, descriptions: false });
    expect(last).toMatchObject({ page: 20, remaining: 0 });
    expect(last.offers.at(-1)!.id).toBe(500);
  });

  it('descriptions truncated to the requested length; CLI unchanged (descriptions by default)', () => {
    const r = offersToRead(db, { limit: 2, length: 100 });
    expect(r.offers[0].description!.length).toBe(100);
    expect(offersToRead(db, { limit: 1 }).offers[0].description!.length).toBe(2500);
  });
});

describe('MCP server: responses of reasonable size', () => {
  let folder: string;
  let client: Client;
  let db: Database;

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { type: string; text: string }[] };
    return { text: r.content[0].text, error: Boolean(r.isError) };
  };

  beforeAll(async () => {
    const root = mkdtempSync(join(tmpdir(), 'vigie-emploi-plafonds-'));
    folder = join(root, 'workspace');
    initializeWorkspace({ folder });
    const state = openState({ dataDir: folder, env: {}, cwd: root });
    db = state.db!;
    fillDatabase(db, 500);
    folder = root;
    const server = createServerMcp(state);
    const [a, b] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test', version: '1.0.0' });
    await Promise.all([server.connect(a), client.connect(b)]);
  });

  afterAll(async () => {
    await client?.close();
    db?.close();
    rmSync(folder, { recursive: true, force: true });
  });

  it('offers_to_read, list_offers, read_offer, rubric stay under the cap', async () => {
    const toRead = await call('offers_to_read');
    const r = JSON.parse(toRead.text);
    expect(r).toMatchObject({ total: 500, remaining: 475 });
    expect(r.offers).toHaveLength(25);
    expect(r.more).toMatch(/page: 2/);
    expect(r.offers[0]).not.toHaveProperty('description');

    const withDesc = JSON.parse((await call('offers_to_read', { descriptions: true, limit: 50 })).text);
    expect(withDesc.offers).toHaveLength(10);
    expect(withDesc.offers[0].description.length).toBeLessThanOrEqual(1500);

    for (const [tool, args] of [
      ['offers_to_read', {}],
      ['offers_to_read', { limit: 60 }],
      ['offers_to_read', { descriptions: true }],
      ['list_offers', {}],
      ['list_offers', { size: 60 }],
      ['read_offer', { id: 1 }],
      ['rubric', {}],
    ] as const) {
      const { text, error } = await call(tool, args);
      expect(error, `${tool} ${JSON.stringify(args)}`).toBe(false);
      expect(text.length, `${tool} ${JSON.stringify(args)}`).toBeLessThan(REPLY_MAX);
    }
    expect((await call('list_offers', { size: 500 })).error).toBe(true);
  });

  it('read_offer cuts a very long description, unless full', async () => {
    const { offer } = saveOffer(db, 'manual', 'long', { title: 'Longue', description: 'x'.repeat(40_000) }, 'manual');
    const short = JSON.parse((await call('read_offer', { id: offer.id })).text);
    expect(short.description.length).toBeLessThan(16_000);
    expect(short.description_truncated).toMatch(/full: true/);
    const full = JSON.parse((await call('read_offer', { id: offer.id, full: true })).text);
    expect(full.description.length).toBe(40_000);
  });

  it('update_rubric in dry run returns the recomputed examples, and accepts examples', async () => {
    const dry_run = JSON.parse((await call('update_rubric', { dry_run: true, change: { weight: { technique: 90 } } })).text);
    expect(dry_run.saved).toBe(false);
    expect(dry_run.computed_examples.length).toBeGreaterThan(0);
    expect(dry_run.computed_examples[0]).toHaveProperty('before');
    expect(dry_run.computed_examples[0]).toHaveProperty('average_before');
    expect(dry_run.computed_examples.some((e: { average: number; average_before: number }) => e.average !== e.average_before)).toBe(true);

    const addition = JSON.parse(
      (
        await call('update_rubric', {
          dry_run: true,
          change: { examples: { add: [{ title: 'Offre réelle', criteria: { technique: { score: 9, justification: 'PHP' } }, comment: 'bonne' }] } },
        })
      ).text,
    );
    expect(addition.computed_examples.at(-1)).toMatchObject({ title: 'Offre réelle', before: null });
  });
});

describe('rubric: examples in the partial change', () => {
  const g = () => readFileRubric(EXAMPLE_RUBRIC)!.rubric;

  it('adds, replaces (same title and company, case-insensitive) and removes', () => {
    const database = g();
    const n = database.examples.length;
    const first = database.examples[0];
    const added = applyChange(database, { examples: { add: [{ title: 'Nouvelle', criteria: {}, comment: '' }] } });
    expect(added.examples).toHaveLength(n + 1);
    const replaced = applyChange(database, {
      examples: { add: [{ ...first, title: first.title.toUpperCase(), comment: 'remplacé' }] },
    });
    expect(replaced.examples).toHaveLength(n);
    expect(replaced.examples[0].comment).toBe('remplacé');
    const removed = applyChange(database, { examples: { remove: [first.title] } });
    expect(removed.examples.map((e) => e.title)).not.toContain(first.title);
    expect(() => applyChange(database, { examples: { remove: ['Inconnu'] } })).toThrow(/Exemple absent/);
    expect(() => applyChange(database, { examples: { add: [{ title: 'X', criteria: { unknown: { score: 5, justification: '' } } }] } })).toThrow(
      /critère IA inconnu/,
    );
    expect(database.examples).toHaveLength(n); // grille d'origine intacte
  });

  it('updateRubric (CLI and MCP): examples recomputed in dry run and after saving, empty database', () => {
    const folder = mkdtempSync(join(tmpdir(), 'vigie-emploi-exemples-'));
    const db = openDatabase(':memory:');
    initializeRubric(db, folder);
    const dry_run = updateRubric(db, folder, { weight: { technique: 90 } }, { author: 'cli', summary: '', dry_run: true });
    expect(dry_run.impact.offers_recalculated).toBe(0);
    expect(dry_run.computed_examples).toEqual(computedExamples(dry_run.rubric, null, { rubric: g(), version: 1 }));
    const saved = updateRubric(db, folder, { examples: { remove: [g().examples[0].title] } }, { author: 'cli', summary: 'retrait' });
    expect(saved.saved).toBe(true);
    expect(saved.computed_examples).toHaveLength(g().examples.length - 1);
    db.close();
    rmSync(folder, { recursive: true, force: true });
  });
});

describe('fill of the CV pages', () => {
  const page = (high: number, low: number) => ({ height: 842, text: { high, low } });

  it('two full pages: no warning', () => {
    const a = fill([page(30, 812), page(30, 790)]);
    expect(a.pages.map((p) => p.fill)).toEqual([100, 97]);
    expect(a.warnings).toEqual([]);
  });

  it('page 1 half empty before page 2: badly placed page break', () => {
    const a = fill([page(30, 520), page(30, 812)]);
    expect(a.pages[0].fill).toBeLessThan(THRESHOLD_PAGE_FULL);
    expect(a.warnings.join(' ')).toMatch(/Page 1 .*saut de page/);
  });

  it('last page too empty: warning; half full: simple remark', () => {
    expect(fill([page(30, 812), page(30, 300)]).warnings.join(' ')).toMatch(/Dernière page \(2\).*beaucoup de vide/);
    const r = fill([page(30, 812), page(30, 500)]);
    expect(r.pages[1].fill).toBe(60);
    expect(r.warnings.join(' ')).toMatch(/^Remarque : dernière page \(2\) remplie à 60 %/);
  });

  it('a single page: no last-page warning; page without text: 0 %', () => {
    expect(fill([page(30, 400)]).warnings).toEqual([]);
    expect(fill([page(30, 812), { height: 842, text: null }]).pages[1].fill).toBe(0);
  });
});

describe('ingest_emails: what to tell the user', () => {
  const summary = (x: Partial<SummaryIngest>): SummaryIngest => ({
    files: 3,
    files_deleted: 3,
    offers_found: 2,
    added: 2,
    duplicates: 0,
    dismissed: 0,
    to_read: 1,
    with_description: 1,
    errors: [],
    without_offer: [],
    confirmations: [],
    detail: {
      added: [
        {
          id: 7,
          source: 'hellowork',
          url: 'https://www.hellowork.com/fr-fr/emplois/1.html',
          title: 'Dev PHP',
          company: 'A',
          status: 'new',
          has_description: false,
        },
        { id: 8, source: 'linkedin', url: 'https://www.linkedin.com/jobs/view/2/', title: 'Dev', company: 'B', status: 'new', has_description: false },
      ],
      dismissed: [],
      duplicates: [],
    },
    ...x,
  });

  it('announces the deleted .eml files and the errors, with the offer concerned', () => {
    const r = presentIngestion(
      summary({ errors: [{ url: 'https://www.hellowork.com/fr-fr/emplois/1.html', message: 'JSON-LD JobPosting absent de la page' }] }),
    ) as { to_tell: string[]; errors: { offer: number }[] };
    expect(r.to_tell[0]).toMatch(/Les 3 fichier\(s\) \.eml traité\(s\) ont été supprimés de emails\//);
    expect(r.to_tell.join(' ')).toMatch(/1 erreur\(s\) d'ingestion, à signaler à l'utilisateur/);
    expect(r.errors[0]).toMatchObject({ offer: 7, message: 'JSON-LD JobPosting absent de la page' });
  });

  it('keep: true: e-mails kept; capped detail', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ id: i, source: 'linkedin', url: `u${i}`, title: `T${i}`, company: null, status: 'new' }));
    const r = presentIngestion(summary({ files_deleted: 0, detail: { added: many, dismissed: [], duplicates: [] } }), { keep: true }) as {
      to_tell: string[];
      detail: { added: unknown[]; added_not_shown: number };
    };
    expect(r.to_tell[0]).toMatch(/conservés dans emails\//);
    expect(r.detail.added).toHaveLength(30);
    expect(r.detail.added_not_shown).toBe(170);
    expect(JSON.stringify(r).length).toBeLessThan(REPLY_MAX);
  });
});
