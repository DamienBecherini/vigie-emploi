import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { files: string[] };

describe('npm package contents', () => {
  it('lists every translated scaffold by name (a "scaffold-*" glob does not match the folder)', () => {
    const translated = readdirSync(root).filter((n) => /^scaffold-[a-z]{2,3}$/.test(n));
    expect(translated.length).toBeGreaterThan(0);
    for (const folder of translated) expect(pkg.files).toContain(folder);
  });
});
