import { describe, expect, it } from 'vitest';
import { createApp } from '../src/api/server.ts';
import { Idle } from '../src/api/idle.ts';
import type { Database } from '../src/db/database.ts';

function clock() {
  const h = { t: 0, read: () => h.t };
  return h;
}

describe('Veille', () => {
  it('expire après le délai, une activité le repousse', () => {
    const h = clock();
    const v = new Idle(3600, h.read);
    h.t = 3599;
    expect(v.expired()).toBe(false);
    v.signal();
    h.t = 3599 + 3599;
    expect(v.expired()).toBe(false);
    h.t = 3599 + 3600;
    expect(v.expired()).toBe(true);
  });

  it('un délai de 0 désactive l’arrêt', () => {
    const h = clock();
    const v = new Idle(0, h.read);
    h.t = 1e9;
    expect(v.expired()).toBe(false);
    expect(v.remainingS()).toBeNull();
  });
});

describe('GET /api/sante', () => {
  type Health = { version: string; idle: { timeout_s: number; remaining_s: number | null } };
  const health = async (app: ReturnType<typeof createApp>) => (await (await app.request('/api/health')).json()) as Health;

  it('suit le contrat « service local » et garde les anciens champs', async () => {
    const d = await health(createApp({} as Database, { dataDir: '/d' }, new Idle(3600, () => 0)));
    expect(d).toMatchObject({ ok: true, folder: '/d', state: 'ready', contract: 2, service: 'vigie-emploi', busy: false, activity: '', remaining_work_s: null });
    expect(d.idle).toEqual({ timeout_s: 3600, remaining_s: 3600 });
    expect(typeof d.version).toBe('string');
  });

  it('le contrôle de santé ne relance pas le délai, une autre requête si', async () => {
    const h = clock();
    const app = createApp({} as Database, { dataDir: '/d' }, new Idle(3600, h.read));
    h.t = 600;
    expect((await health(app)).idle.remaining_s).toBe(3000);
    h.t = 700;
    expect((await health(app)).idle.remaining_s).toBe(2900);
    await app.request('/unknown', { method: 'POST' });
    expect((await health(app)).idle.remaining_s).toBe(3600);
  });

  it('sans arrêt automatique, pas de décompte', async () => {
    const d = await health(createApp({} as Database, { dataDir: '/d' }));
    expect(d.idle).toEqual({ timeout_s: 0, remaining_s: null });
  });
});
