import { describe, expect, it } from 'vitest';
import { decouperGlassdoor } from '../src/ingest/eml.ts';

describe('titres Glassdoor', () => {
  it('sépare entreprise, intitulé, lieu et salaire', () => {
    expect(decouperGlassdoor("Sysgo 4.0 ★ Architecte Logiciel OS Embarqué (H/F/N) Saint-Germain 50 k € - 65 k € (Estimation de l'employeur) 17h")).toEqual({
      entreprise: 'Sysgo',
      titre: 'Architecte Logiciel OS Embarqué (H/F/N)',
      lieu: 'Saint-Germain',
      remuneration: '50 k € - 65 k €',
    });
    expect(decouperGlassdoor('CGI 3.7 ★ Expert(e) Kubernetes F/H Paris Candidature facile')).toEqual({ entreprise: 'CGI', titre: 'Expert(e) Kubernetes F/H', lieu: 'Paris' });
  });

  it('laisse dans l’intitulé ce qui ne se sépare pas sans risque', () => {
    expect(decouperGlassdoor("Marine Care BV AI & Automation Engineer Rotterdam 4 k € - 5 k € (Estimation de l'employeur) Candidature facile")).toEqual({
      titre: 'Marine Care BV AI & Automation Engineer Rotterdam',
      remuneration: '4 k € - 5 k €',
    });
  });
});
