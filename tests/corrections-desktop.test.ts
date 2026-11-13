// Corrections notées au test réel dans Claude Desktop (13/11/2026).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { textePdf } from '../src/core/extraction.ts';
import { appliquerChangement } from '../src/core/grille.ts';
import { EXEMPLE_GRILLE, lireFichierGrille } from '../src/core/grille-stockage.ts';
import { RACINE_APP } from '../src/core/config.ts';

describe('PDF déposé : les liens sont lus', () => {
  it('renvoie l’adresse cachée derrière « GitHub » dans un CV', async () => {
    const r = await textePdf(readFileSync(join(RACINE_APP, 'docs', 'exemples', 'CV-damien-becherini-sobre.pdf')));
    expect(r.liens).toHaveLength(r.pages);
    expect(r.liens[0]).toContain('https://github.com/DamienBecherini');
    expect(r.texte[0]).toContain('GitHub');
  });
});

describe('grille : modifier une règle ne touche pas aux autres', () => {
  const g = () => lireFichierGrille(EXEMPLE_GRILLE)!.grille;

  it('les règles non citées restent ; seule retirer_regles en supprime', () => {
    const base = g();
    const ids = base.regles.map((r) => r.id);
    expect(ids).toContain('stage');
    const modifiee = appliquerChangement(base, { regles: [{ id: 'sur-site-loin', valeur: 2 }, { id: 'devops', libelle: 'Poste DevOps', effet: 'plafond', valeur: 3 }] });
    expect(modifiee.regles.map((r) => r.id)).toEqual([...ids, 'devops']);
    expect(modifiee.regles.find((r) => r.id === 'stage')).toEqual(base.regles.find((r) => r.id === 'stage'));
    const retiree = appliquerChangement(modifiee, { retirer_regles: ['devops'] });
    expect(retiree.regles.map((r) => r.id)).toEqual(ids);
  });
});
