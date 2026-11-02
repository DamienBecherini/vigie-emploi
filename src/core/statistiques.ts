// Statistiques minimales des candidatures : nombre par étape et délai avant la première réponse.
import type { Base } from '../db/base.ts';

export interface Statistiques {
  /** Candidatures envoyées (date d'envoi, ou statut envoyée et suivants dans l'historique). */
  envoyees: number;
  /** … dont une réponse est connue (message reçu, entretien, test, proposition, refus). */
  reponses: number;
  /** … qui ont eu un entretien (événement « entretien » ou statut « entretien »). */
  entretiens: number;
  /** … qui ont eu une proposition (événement « proposition », envoyée ou reçue). */
  propositions: number;
  /** Délai moyen (jours) entre l'envoi et la première réponse arrivée après le jour de l'envoi. */
  delai_moyen_reponse_jours: number | null;
  /** Nombre de candidatures dans ce calcul. */
  delai_base: number;
}

/** Calcule les statistiques à partir des candidatures, des statuts et du journal. */
export function statistiques(db: Base): Statistiques {
  const lignes = db
    .prepare(
      `WITH envoyees AS (
         SELECT o.id,
                (SELECT c.envoyee_le FROM candidatures c WHERE c.offre_id = o.id) AS envoyee_le
         FROM offres o
         WHERE EXISTS (SELECT 1 FROM candidatures c WHERE c.offre_id = o.id AND c.envoyee_le IS NOT NULL)
            OR EXISTS (SELECT 1 FROM statuts s WHERE s.offre_id = o.id AND s.statut IN ('envoyee', 'relancee', 'entretien', 'refus'))
       )
       SELECT e.id, e.envoyee_le,
         (SELECT group_concat(d) FROM (
            SELECT substr(ev.le, 1, 10) AS d FROM evenements ev WHERE ev.offre_id = e.id AND ev.fait = 1
              AND ((ev.type = 'message' AND ev.sens = 'recu') OR ev.type IN ('entretien', 'test')
                   OR (ev.type = 'proposition' AND ev.sens = 'recu'))
            UNION ALL
            SELECT substr(s.le, 1, 10) FROM statuts s WHERE s.offre_id = e.id AND s.statut IN ('entretien', 'refus')
         )) AS reponses,
         EXISTS (SELECT 1 FROM evenements ev WHERE ev.offre_id = e.id AND ev.type = 'entretien' AND ev.fait = 1)
           OR EXISTS (SELECT 1 FROM statuts s WHERE s.offre_id = e.id AND s.statut = 'entretien') AS entretien,
         EXISTS (SELECT 1 FROM evenements ev WHERE ev.offre_id = e.id AND ev.type = 'proposition') AS proposition
       FROM envoyees e`,
    )
    .all() as unknown as {
    id: number;
    envoyee_le: string | null;
    reponses: string | null;
    entretien: number;
    proposition: number;
  }[];
  const delais: number[] = [];
  for (const l of lignes) {
    // Première réponse datée après le jour de l'envoi (un contact entrant suivi d'une réponse le même jour
    // ne dit rien du délai de réponse).
    const envoi = l.envoyee_le && /^\d{4}-\d{2}-\d{2}$/.test(l.envoyee_le) ? l.envoyee_le : null;
    const apres = (l.reponses ?? '').split(',').filter((d) => envoi && d > envoi).sort()[0];
    if (envoi && apres) delais.push((Date.parse(apres) - Date.parse(envoi)) / 86_400_000);
  }
  return {
    envoyees: lignes.length,
    reponses: lignes.filter((l) => l.reponses !== null).length,
    entretiens: lignes.filter((l) => Boolean(l.entretien)).length,
    propositions: lignes.filter((l) => Boolean(l.proposition)).length,
    delai_moyen_reponse_jours: delais.length ? Math.round((delais.reduce((a, b) => a + b, 0) / delais.length) * 10) / 10 : null,
    delai_base: delais.length,
  };
}
