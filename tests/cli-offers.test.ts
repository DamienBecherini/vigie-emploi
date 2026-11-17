// CLI (src/cli/main.ts), safety net before the file is split: init, ingest, list, show, to-read, status, tag, link,
// count, templates, template, help, unknown command and error paths. The outputs are pinned as they are today.
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { cli, FIXTURES, isolate, parsed, workspace } from './cli-helpers.ts';

vi.mock('../src/db/database.ts', async (original) => (await import('./cli-databases.ts')).trackDatabases(original));

const tmp = isolate('offers');
let ws = '';
let run: Awaited<ReturnType<typeof workspace>>;

interface Listing {
  total: number;
  page: number;
  size: number;
  pages: number;
  offers: { id: number; source: string; status: string; title: string; tags: string[]; received_at: string }[];
}

beforeAll(async () => {
  ws = `${tmp.root()}/ws`;
  run = await workspace(ws);
  cpSync(`${FIXTURES}/emails`, `${ws}/emails`, { recursive: true });
});

describe('init', () => {
  it('--json: workspace, configuration, language, no browser', async () => {
    const folder = `${tmp.root()}/init-json`;
    const r = parsed<Record<string, unknown>>(await cli('init', folder, '--language', 'English', '--port', '4499', '--mcp-name', 'vigie-test', '--json'));
    expect(r).toMatchObject({ ok: true, folder, port: 4499, language: 'en', mcp_name: 'vigie-test', browser: null });
    expect(r.config).toBe(`${folder}/vigie-emploi.config.json`);
    expect(existsSync(`${folder}/profil/grille.json`)).toBe(true);
    expect(String(r.prompt)).toMatch(/^You are going to help me with my job search/);
  });

  it('text mode: steps and prompt', async () => {
    const r = await cli('init', `${tmp.root()}/init-text`, '--language', 'en', '--template', 'compact');
    expect(r.code).toBe(0);
    expect(r.out).toContain(`Workspace created: ${tmp.root()}/init-text`);
    expect(r.out).toContain('language en');
    expect(r.out).toContain('browser for PDFs: ');
    expect(r.out).toContain('  ⚠ No Chrome, Edge or Chromium found');
    expect(r.out).toContain('Next steps:');
    expect(r.out).toContain('3. Paste this prompt:');
  });

  it('French by default', async () => {
    const r = await cli('init', `${tmp.root()}/init-fr`);
    expect(r.code).toBe(0);
    expect(r.out).toContain('Espace de travail créé');
  });

  it('errors: two folders, unknown language, folder not empty, invalid port', async () => {
    const two = await cli('init', 'a', 'b', '--language', 'en');
    expect(two.code).toBe(1);
    expect(two.err).toMatch(/^Error: Usage: vigie-emploi init/);
    const de = await cli('init', `${tmp.root()}/init-de`, '--language', 'de');
    expect(de.code).toBe(1);
    expect(de.err).toContain('--language');
    const full = await cli('init', ws, '--language', 'en', '--json');
    expect(full.code).toBe(1);
    expect(JSON.parse(full.err).ok).toBe(false);
    const port = await cli('init', `${tmp.root()}/init-port`, '--language', 'en', '--port', 'abc');
    expect(port.code).toBe(1);
    expect(port.err).toBe('Error: Invalid port: abc\n');
  });
});

describe('ingest (--no-fetch --no-mail)', () => {
  it('--json --keep: offers added, e-mails kept', async () => {
    const r = parsed<Record<string, unknown> & { detail: { added: { id: number; source: string }[] } }>(
      await run('ingest', '--no-fetch', '--no-mail', '--keep', '--json'),
    );
    expect(r).toMatchObject({ files: 4, files_deleted: 0, offers_found: 8, added: 8, duplicates: 0, dismissed: 0, to_read: 8, mail: null });
    expect(r.detail.added.map((o) => o.source)).toEqual(['hellowork', 'hellowork', 'indeed', 'linkedin', 'linkedin', 'linkedin', 'free-work', 'glassdoor']);
    expect(existsSync(`${ws}/emails/linkedin.eml`)).toBe(true);
  });

  it('text mode: duplicates, e-mails deleted', async () => {
    const r = await run('ingest', '--no-fetch', '--no-mail');
    expect(r.code).toBe(0);
    expect(r.out).toBe(
      '4 e-mail(s), 8 offer(s): 0 new (0 with a description, 0 to read in the browser), 8 duplicate(s), 0 discarded by title.\n4 e-mail(s) deleted.\n',
    );
    expect(existsSync(`${ws}/emails/linkedin.eml`)).toBe(false);
  });

  it('text mode with new offers: kept, then the next step', async () => {
    const other = `${tmp.root()}/ingest-text`;
    const r2 = await workspace(other);
    cpSync(`${FIXTURES}/emails/indeed.eml`, `${other}/emails/indeed.eml`);
    const r = await r2('ingest', '--no-fetch', '--no-mail', '--keep');
    expect(r.code).toBe(0);
    expect(r.out).toContain('1 e-mail(s), 1 offer(s): 1 new');
    expect(r.out).toContain('E-mails kept (--keep).');
    expect(r.out).toContain('Next: vigie-emploi to-read');
  });

  it('titles excluded by the configuration: discarded, listed', async () => {
    const other = `${tmp.root()}/ingest-excluded`;
    const runOther = await workspace(other);
    const config = JSON.parse(readFileSync(`${other}/vigie-emploi.config.json`, 'utf8'));
    writeFileSync(`${other}/vigie-emploi.config.json`, JSON.stringify({ ...config, excludedTitles: ['^Stage'] }));
    cpSync(`${FIXTURES}/emails/hellowork.eml`, `${other}/emails/hellowork.eml`);
    const r = await runOther('ingest', '--no-fetch', '--no-mail');
    expect(r.out).toContain('1 discarded by title.');
    expect(r.out).toMatch(/\n {2}discarded #\d+ Stage développeur web H\/F \(title excluded: Stage\)\n/);
  });

  it('--emails: another inbox; e-mail without offer kept', async () => {
    const inbox = `${tmp.root()}/inbox`;
    cpSync(`${FIXTURES}/emails`, inbox, { recursive: true });
    writeFileSync(`${inbox}/nothing.eml`, 'From: a@example.com\nSubject: Hello\nDate: Mon, 2 Nov 2026 10:00:00 +0100\n\nNo offer here.\n');
    const r = await run('ingest', '--no-fetch', '--no-mail', '--emails', inbox, '--keep');
    expect(r.code).toBe(0);
    expect(r.out).toContain('5 e-mail(s), 8 offer(s): 0 new');
    expect(r.out).toContain(`no offer recognised, e-mail kept: `);
    expect(r.out).toContain('nothing.eml');
  });
});

describe('list', () => {
  it('--json: all the offers, received_at descending by default', async () => {
    const r = parsed<Listing>(await run('list', '--json'));
    expect(r).toMatchObject({ total: 8, page: 1, size: 50, pages: 1 });
    expect(r.offers.map((o) => o.id)).toEqual([6, 5, 4, 3, 2, 1, 8, 7]);
  });

  it('filters: --source, --text, --status, --unscored, --score-min', async () => {
    expect(parsed<Listing>(await run('list', '--source', 'linkedin,indeed', '--json')).offers.map((o) => o.id)).toEqual([6, 5, 4, 3]);
    expect(parsed<Listing>(await run('list', '-q', 'WordPress', '--json')).offers.map((o) => o.id)).toEqual([4, 1]);
    expect(parsed<Listing>(await run('list', '--status', 'new', '--json')).total).toBe(8);
    expect(parsed<Listing>(await run('list', '--status', 'go,sent', '--json')).total).toBe(0);
    expect(parsed<Listing>(await run('list', '--unscored', '--json')).total).toBe(8);
    expect(parsed<Listing>(await run('list', '--no-unscored', '--json')).total).toBe(0);
    expect(parsed<Listing>(await run('list', '--score-min', '6,5', '--json')).total).toBe(0);
    expect(parsed<Listing>(await run('list', '--from', '2026-11-01', '--until', '2026-11-01', '--json')).offers.map((o) => o.id)).toEqual([3]);
    expect(parsed<Listing>(await run('list', '--applications', '--json')).total).toBe(0);
  });

  it('sort, order and paging', async () => {
    const r = parsed<Listing>(await run('list', '--sort', 'id', '--order', 'asc', '--size', '3', '--page', '2', '--json'));
    expect(r).toMatchObject({ total: 8, page: 2, size: 3, pages: 3 });
    expect(r.offers.map((o) => o.id)).toEqual([4, 5, 6]);
  });

  it('text mode: table and footer', async () => {
    const r = await run('list', '--size', '2');
    expect(r.code).toBe(0);
    const lines = r.out.split('\n');
    expect(lines[0]).toMatch(/^id\s+score\s+status\s+source\s+received\s+company\s+title$/);
    expect(lines[1]).toMatch(/^-+ {2}-+/);
    expect(lines[2]).toMatch(/^6\s+—\s+new\s+linkedin\s+2026-11-02\s+Développeur Java Spring$/);
    expect(r.out).toContain('Page 1/4 · 8 offer(s)');
  });

  it('errors: unknown status, invalid page, invalid score', async () => {
    const s = await run('list', '--status', 'bogus');
    expect(s.code).toBe(1);
    expect(s.err).toBe('Error: Unknown status: bogus\n');
    expect((await run('list', '--page', '0')).err).toBe('Error: Invalid page: 0\n');
    expect((await run('list', '--score-min', 'abc')).err).toBe('Error: Invalid score-min: abc\n');
  });
});

describe('show', () => {
  it('--json: detail of the offer', async () => {
    const d = parsed<Record<string, unknown>>(await run('show', '1', '--json'));
    expect(d).toMatchObject({ id: 1, source: 'hellowork', site_id: '70000001', title: 'Développeur WordPress H/F', status: 'new' });
  });

  it('text mode', async () => {
    const r = await run('show', '1');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^#1 Développeur WordPress H\/F\n/);
    expect(r.out).toContain('Status: New · Score: — · Source: hellowork (70000001)');
    expect(r.out).toContain('URL: https://www.hellowork.com/fr-fr/emplois/70000001.html');
    expect(r.out).toContain('Received 2026-10-31 · published —');
    expect(r.out).toContain('Status history:');
  });

  it('unknown offer: exit code 1, message on stderr; JSON object with --json', async () => {
    const r = await run('show', '999');
    expect(r).toEqual({ code: 1, out: '', err: 'Error: Offer 999 not found\n' });
    const j = await run('show', '999', '--json');
    expect(j.code).toBe(1);
    expect(j.out).toBe('');
    expect(JSON.parse(j.err)).toEqual({ ok: false, error: 'Offer 999 not found', code: 'not-found' });
  });

  it('invalid id', async () => {
    expect((await run('show', 'abc')).err).toBe('Error: Invalid id: abc\n');
    expect((await run('show')).err).toBe('Error: Invalid id: undefined\n');
  });
});

describe('to-read', () => {
  it('--json: offers to read, total', async () => {
    const r = parsed<{ total: number; offers: { id: number; reading: string }[] }>(await run('to-read', '--json', '--limit', '2'));
    expect(r.total).toBe(8);
    expect(r.offers).toHaveLength(2);
  });

  it('text mode: reading mode of each offer', async () => {
    const r = await run('to-read');
    expect(r.code).toBe(0);
    expect(r.out).toContain('#1 [hellowork] Développeur WordPress H/F\n    https://www.hellowork.com/fr-fr/emplois/70000001.html · to read in the browser');
    expect(r.out).toContain('#8 [glassdoor] Intégrateur API\n    https://www.glassdoor.fr/job-listing/?jl=1009000000001 · protected page: ask for the text');
    expect(r.out).toContain('8 offer(s) to process.');
  });

  it('nothing to read', async () => {
    const other = `${tmp.root()}/to-read-empty`;
    const r = await (await workspace(other))('to-read');
    expect(r.out).toBe('No offer to read.\n');
  });
});

describe('status', () => {
  it('--json and text mode', async () => {
    expect(parsed(await run('status', '2', 'dismissed', '-m', 'internship', '--json'))).toEqual({ ok: true, id: 2, status: 'dismissed' });
    const r = await run('status', '2', 'to-read');
    expect(r.code).toBe(0);
    expect(r.out).toBe('#2 → To read\n');
    const d = parsed<{ statuses: { status: string; comment: string | null }[] }>(await run('show', '2', '--json'));
    expect(d.statuses.map((s) => s.status)).toEqual(expect.arrayContaining(['dismissed', 'to-read']));
    expect(d.statuses.find((s) => s.status === 'dismissed')?.comment).toBe('internship');
  });

  it('errors: status missing or unknown, offer not found', async () => {
    expect((await run('status', '2')).err).toMatch(/^Error: Status expected among: new, to-read, scored/);
    expect((await run('status', '2', 'bogus')).code).toBe(1);
    expect((await run('status', '999', 'go')).err).toBe('Error: Offer 999 not found\n');
  });
});

describe('tag', () => {
  it('+a -b: additions and removals, --json', async () => {
    expect(parsed(await run('tag', '3', '+remote', '+php', '--json'))).toEqual({ ok: true, id: 3, tags: ['php', 'remote'] });
    expect(parsed(await run('tag', '3', '+later', '-php', '--json'))).toEqual({ ok: true, id: 3, tags: ['later', 'remote'] });
  });

  it('text mode; tags in the detail', async () => {
    expect((await run('show', '3')).out).toContain('\nTags: later, remote\n');
    expect((await run('tag', '3', '-later')).out).toBe('#3 : remote\n');
    expect((await run('tag', '3', '-remote')).out).toBe('#3 : (no tag)\n');
  });

  it('errors: tag without prefix, offer not found', async () => {
    expect((await run('tag', '3', 'nope')).err).toBe('Error: tag: prefix each tag with + or - (nope)\n');
    expect((await run('tag', '999', '+x')).err).toBe('Error: Offer 999 not found\n');
  });
});

describe('link', () => {
  it('sets and clears the link', async () => {
    expect(parsed(await run('link', '7', 'https://example.com/job/7', '--json'))).toEqual({ ok: true, id: 7, url: 'https://example.com/job/7' });
    expect((await run('link', '7', '-')).out).toBe('#7 : (no link)\n');
    expect((await run('link', '7', 'https://example.com/job/7b')).out).toBe('#7 : https://example.com/job/7b\n');
  });

  it('errors: URL missing, invalid URL, offer not found', async () => {
    expect((await run('link', '7')).err).toBe('Error: link: URL expected (or - to clear)\n');
    const invalid = await run('link', '7', 'not a url');
    expect(invalid.code).toBe(1);
    expect(invalid.err).toMatch(/^Error: /);
    expect(invalid.err).not.toContain('    at ');
    expect((await run('link', '999', 'https://example.com')).err).toBe('Error: Offer 999 not found\n');
  });
});

describe('count', () => {
  it('characters and words of each block', async () => {
    const file = `${tmp.root()}/message.txt`;
    writeFileSync(file, 'Hello there, this is a message.');
    const j = parsed<{ ok: boolean; file: string; blocks: { characters: number; words: number }[] }>(await run('count', file, '--json'));
    expect(j.ok).toBe(true);
    expect(j.blocks[0]).toMatchObject({ characters: 31, words: 6 });
    const r = await run('count', file);
    expect(r.out).toContain('    31 characters     6 words  “Hello there');
  });

  it('errors: no file, missing file', async () => {
    expect((await run('count')).err).toBe('Error: Usage: vigie-emploi count <file>\n');
    expect((await run('count', `${tmp.root()}/missing.txt`)).code).toBe(1);
  });
});

describe('templates and template', () => {
  it('templates: list', async () => {
    const j = parsed<{ templates: { name: string }[] }>(await run('templates', '--json'));
    expect(j.templates.map((x) => x.name)).toEqual(expect.arrayContaining(['plain', 'modern', 'compact']));
    const r = await run('templates');
    expect(r.out).toMatch(/^compact\s+\S/m);
    expect(r.out).toContain('Choose: vigie-emploi template <name>');
  });

  it('template: installs, keeps the old one', async () => {
    const j = parsed<{ ok: boolean; folder: string; old: string | null }>(await run('template', 'modern', '--json'));
    expect(j.ok).toBe(true);
    expect(readFileSync(`${j.folder}/gabarit.css`, 'utf8')).toContain('« modern »');
    expect(j.old).not.toBeNull();
    // Another workspace: two installs within the same second would rename to the same backup folder.
    const other = `${tmp.root()}/template-text`;
    const r = await (await workspace(other))('template', 'plain');
    expect(r.out).toContain(`Template “plain” installed in `);
    expect(r.out).toContain(' (old template kept in ');
  });

  it('errors: no name, unknown template', async () => {
    expect((await run('template')).err).toBe('Error: Usage: vigie-emploi template <name> (list: vigie-emploi templates)\n');
    expect((await run('template', 'unknown')).code).toBe(1);
  });
});

describe('help, unknown command, bad option', () => {
  it('help, --help, -h and no command: help on stdout, exit code 0', async () => {
    for (const args of [['help'], ['--help'], ['-h'], [], ['list', '--help', '--data', ws]]) {
      const r = await cli(...args);
      expect(r.code, args.join(' ')).toBe(0);
      expect(r.out).toContain('ingest [--keep]');
    }
  });

  it('unknown command: exit code 2, message and help on stderr', async () => {
    const r = await run('bogus');
    expect(r.code).toBe(2);
    expect(r.out).toBe('');
    expect(r.err).toMatch(/^Unknown command: bogus\n\n/);
    expect(r.err).toContain('list [filters]');
  });

  it('--data=<folder> form, read before the parsing for the language', async () => {
    const r = await cli('show', '999', `--data=${ws}`);
    expect(r.err).toBe('Error: Offer 999 not found\n');
  });

  it('unknown option: exit code 1, parser message without stack', async () => {
    const r = await run('list', '--bogus');
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/^Error: Unknown option '--bogus'/);
    expect(r.err).not.toContain('    at ');
    const j = await run('list', '--bogus', '--json');
    expect(JSON.parse(j.err).ok).toBe(false);
  });
});

describe('French', () => {
  it('messages in the language of the workspace', async () => {
    const fr = `${tmp.root()}/fr`;
    const runFr = await workspace(fr, 'fr');
    expect((await runFr('show', '1')).err).toBe('Erreur : Offre 1 introuvable\n');
    expect((await runFr('to-read')).out).toBe('Aucune offre à lire.\n');
    expect((await runFr('bogus')).err).toMatch(/^Commande inconnue : bogus/);
  });
});
