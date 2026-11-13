import { describe, expect, it } from 'vitest';
import { splitGlassdoor } from '../src/ingest/eml.ts';

describe('titres Glassdoor', () => {
  it('sépare entreprise, intitulé, lieu et salaire', () => {
    expect(splitGlassdoor("Sysgo 4.0 ★ Architecte Logiciel OS Embarqué (H/F/N) Saint-Germain 50 k € - 65 k € (Estimation de l'employeur) 17h")).toEqual({
      company: 'Sysgo',
      title: 'Architecte Logiciel OS Embarqué (H/F/N)',
      location: 'Saint-Germain',
      compensation: '50 k € - 65 k €',
    });
    expect(splitGlassdoor('CGI 3.7 ★ Expert(e) Kubernetes F/H Paris Candidature facile')).toEqual({ company: 'CGI', title: 'Expert(e) Kubernetes F/H', location: 'Paris' });
  });

  it('laisse dans l’intitulé ce qui ne se sépare pas sans risque', () => {
    expect(splitGlassdoor("Marine Care BV AI & Automation Engineer Rotterdam 4 k € - 5 k € (Estimation de l'employeur) Candidature facile")).toEqual({
      title: 'Marine Care BV AI & Automation Engineer Rotterdam',
      compensation: '4 k € - 5 k €',
    });
  });
});
