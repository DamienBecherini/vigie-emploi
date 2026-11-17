// Security review of 17/11/2026: links, file access, IMAP encryption, résumé rendering.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/database.ts';
import { offerForInput } from '../src/core/scoring.ts';
import { safeFile } from '../src/core/files.ts';
import { isLoopback } from '../src/mail/fetch.ts';
import { cvToHtml } from '../src/cv/cv.ts';

describe('offer links', () => {
  it('refuses a non-http(s) address when an offer is created from its URL', () => {
    const db = openDatabase(':memory:');
    for (const url of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,x', 'file:///etc/passwd']) {
      expect(() => offerForInput(db, { url, title: 'x' }, 'manual'), url).toThrow();
    }
    expect(offerForInput(db, { url: 'https://example.com/job/1', title: 'x' }, 'manual')?.created).toBe(true);
  });
});

describe('dashboard file access (safeFile)', () => {
  function workspace(): string {
    const dir = mkdtempSync(join(tmpdir(), 'vigie-safe-'));
    mkdirSync(join(dir, 'data'));
    writeFileSync(join(dir, 'data', 'vigie-emploi.sqlite'), 'db');
    mkdirSync(join(dir, 'cv'));
    writeFileSync(join(dir, 'cv', 'cv.md'), '# CV');
    return dir;
  }

  it('serves an ordinary file', () => {
    const dir = workspace();
    try {
      expect(safeFile(dir, 'cv/cv.md').relative).toBe('cv/cv.md');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses data/ written with a trailing dot or space (Windows ignores them)', () => {
    const dir = workspace();
    try {
      for (const p of ['data./vigie-emploi.sqlite', 'data /vigie-emploi.sqlite', 'DATA../vigie-emploi.sqlite']) {
        expect(() => safeFile(dir, p), p).toThrow();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a link inside the folder that leads to data/', () => {
    const dir = workspace();
    try {
      // A junction needs no administrator rights on Windows; elsewhere the type is ignored.
      symlinkSync(join(dir, 'data'), join(dir, 'link'), 'junction');
      expect(() => safeFile(dir, 'link/vigie-emploi.sqlite')).toThrow(/denied|refusé/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('IMAP without direct TLS', () => {
  it('only a server on this machine may skip STARTTLS', () => {
    for (const h of ['localhost', '127.0.0.1', '127.0.0.2', '::1', '[::1]', ' LOCALHOST ']) expect(isLoopback(h), h).toBe(true);
    for (const h of ['imap.gmail.com', '192.168.1.10', 'localhost.evil.test', '127.0.0.1.evil.test']) expect(isLoopback(h), h).toBe(false);
  });
});

describe('résumé rendering by Chrome', () => {
  it('forbids scripts, connections and frames in the generated page', () => {
    const html = cvToHtml('# Name\n\n<script>fetch("https://x.test")</script>', { css: 'gabarit.css' });
    const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? '';
    for (const d of ["script-src 'none'", "connect-src 'none'", "frame-src 'none'", "object-src 'none'"]) expect(csp).toContain(d);
  });
});
