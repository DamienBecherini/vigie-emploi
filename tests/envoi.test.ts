import { describe, expect, it } from 'vitest';
import { ouvrirBase } from '../src/db/base.ts';
import { ajouterStatut, enregistrerOffre } from '../src/core/offres.ts';

describe('passage en « envoyee »', () => {
  it('pose la date d’envoi si elle manque, sans écraser une date existante', () => {
    const db = ouvrirBase(':memory:');
    const a = enregistrerOffre(db, 'linkedin', 'env-1', { titre: 'Offre A' }, 'manuel').offre.id;
    ajouterStatut(db, a, 'envoyee', { le: '2026-11-10T09:00:00Z' });
    const ca = db.prepare('SELECT envoyee_le FROM candidatures WHERE offre_id = ?').get(a) as { envoyee_le: string };
    expect(ca.envoyee_le).toBe('2026-11-10');

    const b = enregistrerOffre(db, 'linkedin', 'env-2', { titre: 'Offre B' }, 'manuel').offre.id;
    db.prepare('INSERT INTO candidatures (offre_id, envoyee_le) VALUES (?, ?)').run(b, '2026-11-01');
    ajouterStatut(db, b, 'envoyee', { le: '2026-11-12T09:00:00Z' });
    const cb = db.prepare('SELECT envoyee_le FROM candidatures WHERE offre_id = ?').get(b) as { envoyee_le: string };
    expect(cb.envoyee_le).toBe('2026-11-01');
    db.close();
  });
});
