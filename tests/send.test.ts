import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/database.ts';
import { addStatus, saveOffer } from '../src/core/offers.ts';

describe('passage en « envoyee »', () => {
  it('pose la date d’envoi si elle manque, sans écraser une date existante', () => {
    const db = openDatabase(':memory:');
    const a = saveOffer(db, 'linkedin', 'env-1', { title: 'Offre A' }, 'manual').offer.id;
    addStatus(db, a, 'sent', { at: '2026-11-10T09:00:00Z' });
    const ca = db.prepare('SELECT sent_at FROM applications WHERE offer_id = ?').get(a) as { sent_at: string };
    expect(ca.sent_at).toBe('2026-11-10');

    const b = saveOffer(db, 'linkedin', 'env-2', { title: 'Offre B' }, 'manual').offer.id;
    db.prepare('INSERT INTO applications (offer_id, sent_at) VALUES (?, ?)').run(b, '2026-11-01');
    addStatus(db, b, 'sent', { at: '2026-11-12T09:00:00Z' });
    const cb = db.prepare('SELECT sent_at FROM applications WHERE offer_id = ?').get(b) as { sent_at: string };
    expect(cb.sent_at).toBe('2026-11-01');
    db.close();
  });
});
