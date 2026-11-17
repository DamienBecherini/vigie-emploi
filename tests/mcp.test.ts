// Launches the real MCP server (node bin/vigie-emploi.js mcp, stdio transport) and calls its tools like an AI.
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT = join(import.meta.dirname, '..');
const FIXTURES = join(import.meta.dirname, 'fixtures');

type Result = { isError?: boolean; content: { type: string; text: string }[] };

describe('MCP server (stdio)', () => {
  let folder: string;
  let client: Client;

  const call = async (name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
    const r = (await client.callTool({ name, arguments: args })) as Result;
    if (r.isError) return { error: r.content[0].text };
    return JSON.parse(r.content[0].text) as Record<string, unknown>;
  };

  beforeAll(async () => {
    folder = mkdtempSync(join(tmpdir(), 'vigie-emploi-mcp-'));
    cpSync(join(FIXTURES, 'data'), folder, { recursive: true });
    cpSync(join(FIXTURES, 'emails'), join(folder, 'emails'), { recursive: true });
    // cwd = temporary folder: the repository's possible personal configuration is not read.
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(ROOT, 'bin', 'vigie-emploi.js'), 'mcp', '--data', folder],
      cwd: folder,
      env: { ...(process.env as Record<string, string>), VIGIE_EMPLOI_CONFIG: '' },
      stderr: 'pipe',
    });
    client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(transport);
  }, 30_000);

  afterAll(async () => {
    await client?.close();
    rmSync(folder, { recursive: true, force: true });
  });

  it('exposes the expected tools, described in English', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'add_event',
        'apply',
        'change_status',
        'deadlines',
        'save_application',
        'folder_files',
        'generate_tracker',
        'rubric',
        'rubric_history',
        'ingest_emails',
        'journal',
        'read_offer',
        'mark_done',
        'update_event',
        'list_offers',
        'update_link',
        'update_tags',
        'score_batch',
        'score_offer',
        'offers_to_read',
        'update_rubric',
        'rescore',
        // Workspace, files and CV (MCP client without access to files)
        'workspace_state',
        'initialize_workspace',
        'list_files',
        'read_file',
        'write_file',
        'move_file',
        'generate_cv',
        'count',
        'list_templates',
        'choose_template',
        'open_dashboard',
      ].sort(),
    );
    const score = tools.find((t) => t.name === 'score_offer')!;
    expect(score.description).toMatch(/history/);
    expect(Object.keys(score.inputSchema.properties ?? {})).toEqual(expect.arrayContaining(['id', 'url', 'score', 'fit', 'gaps']));
  });

  it('full flow: ingest → read → score → apply → save → generate the tracker', async () => {
    const ing = await call('ingest_emails', { keep: true, download: false });
    expect(ing.added).toBeGreaterThan(0);
    expect(readdirSync(join(folder, 'emails')).length).toBe(4); // keep: e-mails kept

    const toRead = (await call('offers_to_read', { limit: 3 })) as unknown as { total: number; offers: { id: number; reading: string }[] };
    expect(toRead.offers.length).toBeGreaterThan(0);
    const id = toRead.offers[0].id;

    const n = await call('score_offer', { id, score: 6, raw_score: 6.5, penalties: '-0,5 trajet', fit: 'PHP', gaps: 'sur site', read: true });
    expect(n).toMatchObject({ ok: true, id, score: 6, status: 'scored' });
    const batch = await call('score_batch', { offers: [{ id: toRead.offers[1].id, score: 3, gaps: 'hors cible' }] });
    expect(batch).toMatchObject({ ok: true, scored: 1 });

    const list = (await call('list_offers', { statuses: ['scored'], score_min: 5, sort: 'score' })) as unknown as { offers: { id: number }[] };
    expect(list.offers.map((o) => o.id)).toContain(id);

    const tags = await call('update_tags', { id, add: ['to-follow-up'] });
    expect(tags).toMatchObject({ tags: ['to-follow-up'] });

    const c = (await call('apply', { id })) as unknown as { suggested_folder: string; offer: { status: string } };
    expect(c.offer.status).toBe('go');
    expect(c.suggested_folder).toMatch(/^candidatures\//);

    const e = await call('save_application', {
      id,
      folder: c.suggested_folder,
      channel: 'LinkedIn',
      sent_at: '02/11/2026',
      next_action: 'Relancer le 09/11',
    });
    expect(e).toMatchObject({ ok: true, status: 'sent', status_added: 'sent' });

    const detail = (await call('read_offer', { id })) as unknown as { application: { next_action: string; sent_at: string } };
    expect(detail.application).toMatchObject({ next_action: 'Relancer le 09/11', sent_at: '2026-11-02' });

    // Journal: the call told by the user, then the next deadline.
    const ev = (await call('add_event', {
      id,
      type: 'interview',
      at: '02/11/2026 11:00',
      summary: 'Appel avec la RH : périmètre et salaire',
      channel: 'Téléphone',
    })) as unknown as { event: { id: number; done: boolean } };
    expect(ev.event.done).toBe(true);
    const ech = (await call('add_event', { id, type: 'message', direction: 'sent', at: '+3', summary: 'Relancer la RH' })) as unknown as {
      event: { id: number; done: boolean };
    };
    expect(ech.event.done).toBe(false);
    const next = (await call('deadlines', { days: 7 })) as unknown as { upcoming: { id: number; offer_id: number }[] };
    expect(next.upcoming).toEqual([expect.objectContaining({ id: ech.event.id, offer_id: id })]);
    const j = (await call('journal', { id })) as unknown as { events: { id: number }[] };
    expect(j.events.map((e) => e.id)).toEqual([ech.event.id, ev.event.id]);
    expect(((await call('mark_done', { event_id: ech.event.id })) as { event: { done: boolean } }).event.done).toBe(true);
    expect((await call('update_event', { event_id: ev.event.id, contacts: 'Julie (RH)' })).event).toMatchObject({
      contacts: 'Julie (RH)',
    });
    const f = (await call('folder_files', { id })) as unknown as { folder: string; exists: boolean };
    expect(f).toMatchObject({ folder: c.suggested_folder, exists: false });
    expect((await call('add_event', { id, type: 'note', summary: 'x', at: 'bientôt' })).error).toMatch(/Date invalide/);

    const s = (await call('generate_tracker')) as unknown as { file: string; in_progress: number };
    expect(s.file).toBe(join(folder, 'candidatures', '_SUIVI.genere.md'));
    expect(existsSync(s.file)).toBe(true);
    expect(s.in_progress).toBe(1);
  }, 30_000);

  it('rubric: read, criteria-based scoring, change (dry run then save), rescore, history', async () => {
    expect((await call('rubric')).error).toMatch(/Pas de grille/);
    cpSync(join(ROOT, 'examples', 'rubric.json'), join(folder, 'profil', 'grille.json'));
    const g = (await call('rubric')) as unknown as { version: number; instructions_ai: string[]; computed_examples: { score: number }[] };
    expect(g.version).toBe(1);
    expect(g.instructions_ai.join(' ')).toMatch(/Ne donne pas la note finale/);
    expect(g.computed_examples.map((e) => e.score)).toEqual([8, 3.5, 0]);

    const toRead = (await call('list_offers', { size: 2 })) as unknown as { offers: { id: number }[] };
    const [a, b] = toRead.offers.map((o) => o.id);
    const batch = (await call('score_batch', {
      offers: [
        { id: a, score: 2, criteria: { technique: { score: 8, justification: 'PHP' }, role: { score: 7 }, interet: { score: 6 }, risque: { score: 7 } }, inputs: { onsite_days: 1, salary_min: 55000, salary_max: 60000, unit: 'year' } },
        { id: b, criteria: { technique: { score: 9 } }, blockers: ['stage'] },
      ],
    })) as unknown as { offers: { score: number; warnings?: string[]; breakdown: { criteria: unknown[] } }[] };
    // 8×.35 + 8×.2 + (57,5 K€ : 5 + 5×17,5/20 = 9,375)×.2 + 7×.1 + 6×.1 + 7×.05 = 7,925 → 8
    expect(batch.offers[0].score).toBe(8);
    expect(batch.offers[0].warnings?.[0]).toMatch(/ignoré/);
    expect(batch.offers[0].breakdown.criteria).toHaveLength(6);
    expect(batch.offers[1].score).toBe(0);
    expect((await call('score_offer', { id: a, criteria: { teletravail: { score: 3 } } })).error).toMatch(/calculé/);
    expect((await call('score_offer', { id: a, criteria: { technique: { score: 3 } }, blockers: ['armee'] })).error).toMatch(/Règle bloquante inconnue/);

    const dry_run = (await call('update_rubric', { change: { rules: [{ id: 'stage', active: false }] }, dry_run: true })) as unknown as {
      saved: boolean;
      impact: { rising: { id: number }[] };
    };
    expect(dry_run.saved).toBe(false);
    expect(dry_run.impact.rising.map((x) => x.id)).toEqual([b]);
    expect((await call('update_rubric', { change: { threshold: 5 } })).error).toMatch(/summary/);
    const m = (await call('update_rubric', { change: { rules: [{ id: 'stage', active: false }] }, summary: 'Stages acceptés' })) as unknown as {
      version: number;
    };
    expect(m.version).toBe(2);
    expect(((await call('read_offer', { id: b })) as unknown as { score: number }).score).toBeGreaterThan(0);
    expect(await call('rescore')).toMatchObject({ ok: true, version: 2, impact: { offers_recalculated: 2, changed: 0 } });
    const r = (await call('update_rubric', { restore_version: 1 })) as unknown as { version: number };
    expect(r.version).toBe(3);
    const h = (await call('rubric_history')) as unknown as { versions: { version: number; author: string; summary: string }[] };
    expect(h.versions.map((x) => [x.version, x.author, x.summary])).toEqual([
      [3, 'mcp', 'Retour à la version 1'],
      [2, 'mcp', 'Stages acceptés'],
      [1, 'file', "Grille d'exemple de vigie-emploi (à adapter)"],
    ]);
  }, 30_000);

  it('errors returned to the AI without stopping the server', async () => {
    expect((await call('read_offer', { id: 999999 })).error).toMatch(/introuvable/);
    expect((await call('score_offer', { score: 5 })).error).toMatch(/id.*url/);
    expect((await call('update_link', { id: 1, url: 'not-one-link' })).error).toMatch(/Lien invalide/);
    const r = (await client.callTool({ name: 'change_status', arguments: { id: 1, status: 'unknown' } })) as Result;
    expect(r.isError).toBe(true);
    expect((await call('change_status', { id: 1, status: 'dismissed', comment: 'hors cible' })).status).toBe('dismissed');
  });
});
