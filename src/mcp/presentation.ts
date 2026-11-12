// Mise en forme des réponses volumineuses du serveur MCP : une IA sans outil de lecture de fichiers (Claude Desktop)
// doit pouvoir lire chaque réponse en entier. Cible : moins de 25 000 caractères par réponse.
import type { Impact } from '../core/grille-stockage.ts';
import type { DetailOffre } from '../core/offres.ts';
import type { LigneListe } from '../core/requetes.ts';
import type { ResumeIngest } from '../ingest/ingest.ts';
import { bi } from './textes.ts';

/** Taille visée d'une réponse d'outil, en caractères. */
export const REPONSE_MAX = 25_000;

/** offres_a_lire : offres par page en résumé, et avec descriptions. */
export const A_LIRE_DEFAUT = 25;
export const A_LIRE_MAX = 60;
export const A_LIRE_MAX_DESCRIPTIONS = 10;
export const LONGUEUR_DESCRIPTION_PAGE = 1_500;

/** lister_offres : offres par page. */
export const LISTE_DEFAUT = 25;
export const LISTE_MAX = 60;

/** lire_offre : description et notes. */
export const DESCRIPTION_MAX = 15_000;
export const NOTES_MAX = 3;

/** ingerer_emails : lignes de détail par catégorie. */
export const DETAIL_INGESTION_MAX = 30;

/** Retire les champs null, indéfinis, chaînes vides et listes vides (réponses plus courtes, sans perte). */
export function sansVides<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)),
  ) as Partial<T>;
}

/** Ligne de lister_offres sans les champs techniques (id du site, horodatages, montants décomposés). */
export function ligneCompacte(l: LigneListe): Partial<LigneListe> {
  const { id_site: _i, cree_le: _c, maj_le: _m, origine: _o, remuneration_min: _a, remuneration_max: _b, remuneration_unite: _u, ...reste } = l;
  return sansVides(reste);
}

/** Détail d'une offre plafonné : description tronquée (sauf complet), seules les notes les plus récentes. */
export function detailPlafonne(d: DetailOffre, o: { complet?: boolean } = {}): Record<string, unknown> {
  const description = d.description ?? null;
  const tronquee = Boolean(description && !o.complet && description.length > DESCRIPTION_MAX);
  return {
    ...d,
    description: tronquee ? `${description!.slice(0, DESCRIPTION_MAX)}…` : description,
    ...(tronquee
      ? {
          description_tronquee: bi({
            fr: `description de ${description!.length} caractères coupée à ${DESCRIPTION_MAX} : complet: true pour la suite`,
            en: `description of ${description!.length} characters cut at ${DESCRIPTION_MAX}: complet: true for the rest`,
          }),
        }
      : {}),
    notes: d.notes.slice(0, NOTES_MAX),
    ...(d.notes.length > NOTES_MAX ? { notes_anciennes_non_affichees: d.notes.length - NOTES_MAX } : {}),
  };
}

/** Impact d'un changement de grille : les 30 plus forts changements (montées et descentes de seuil comprises, 30 chacune). */
export function impactPlafonne(i: Impact): Record<string, unknown> {
  const n = 30;
  return {
    ...i,
    montent: i.montent.slice(0, n),
    descendent: i.descendent.slice(0, n),
    changements: i.changements.slice(0, n),
    ...(i.changements.length > n ? { changements_non_affiches: i.changements.length - n } : {}),
    ...(i.montent.length > n || i.descendent.length > n ? { montees_descentes_tronquees: true } : {}),
  };
}

const premieres =<T>(l: T[], n: number) => ({ liste: l.slice(0, n), reste: Math.max(0, l.length - n) });

/**
 * Réponse de ingerer_emails : compteurs, puis ce qu'il faut dire à l'utilisateur (e-mails supprimés, erreurs à
 * signaler), et un détail plafonné (la liste complète des offres à lire est dans offres_a_lire).
 */
export function presenterIngestion(r: ResumeIngest, o: { garder?: boolean } = {}): Record<string, unknown> {
  const aDire: string[] = [];
  const lus = r.fichiers - r.sans_offre.length;
  if (r.fichiers_supprimes > 0) {
    aDire.push(
      bi({
        fr: `Les ${r.fichiers_supprimes} fichier(s) .eml traité(s) ont été supprimés de emails/ (leurs offres sont en base).`,
        en: `The ${r.fichiers_supprimes} processed .eml file(s) have been deleted from emails/ (their job ads are in the database).`,
      }),
    );
  } else if (o.garder && lus > 0) {
    aDire.push(
      bi({
        fr: `Les ${lus} fichier(s) .eml traité(s) sont conservés dans emails/ (garder: true).`,
        en: `The ${lus} processed .eml file(s) are kept in emails/ (garder: true).`,
      }),
    );
  }
  if (r.sans_offre.length) {
    aDire.push(
      bi({
        fr: `${r.sans_offre.length} e-mail(s) sans offre reconnue, laissé(s) dans emails/ (format inconnu) : ${r.sans_offre.join(', ')}.`,
        en: `${r.sans_offre.length} e-mail(s) with no recognised job ad, left in emails/ (unknown format): ${r.sans_offre.join(', ')}.`,
      }),
    );
  }
  if (r.erreurs.length) {
    aDire.push(
      bi({
        fr:
          `${r.erreurs.length} erreur(s) d'ingestion, à signaler à l'utilisateur (voir erreurs) : ` +
          'une description non lue ne bloque pas l’offre, qui est en base et se lit dans le navigateur.',
        en:
          `${r.erreurs.length} ingestion error(s), to report to the user (see erreurs): ` +
          'a description that could not be read does not block the job ad, which is in the database and can be read in the browser.',
      }),
    );
  }
  if (r.confirmations.length) {
    aDire.push(
      bi({
        fr: `${r.confirmations.length} accusé(s) de réception de candidature : vérifier que ces candidatures sont enregistrées comme envoyées.`,
        en: `${r.confirmations.length} application acknowledgement(s): check that these applications are recorded as sent.`,
      }),
    );
  }
  const nouvelles = premieres(r.detail.nouvelles, DETAIL_INGESTION_MAX);
  const ecartees = premieres(r.detail.ecartees, DETAIL_INGESTION_MAX);
  const doublons = premieres(r.detail.doublons, 10);
  return {
    ok: true,
    fichiers: r.fichiers,
    fichiers_supprimes: r.fichiers_supprimes,
    offres_trouvees: r.offres_trouvees,
    nouvelles: r.nouvelles,
    doublons: r.doublons,
    ecartees: r.ecartees,
    a_lire: r.a_lire,
    avec_description: r.avec_description,
    a_dire: aDire,
    erreurs: r.erreurs.map((e) => ({
      ...e,
      ...(e.url ? { offre: r.detail.nouvelles.concat(r.detail.ecartees).find((x) => x.url === e.url)?.id ?? null } : {}),
    })),
    sans_offre: r.sans_offre,
    confirmations: r.confirmations,
    detail: {
      nouvelles: nouvelles.liste.map((x) => sansVides({ id: x.id, source: x.source, titre: x.titre, entreprise: x.entreprise, a_description: x.a_description })),
      ...(nouvelles.reste ? { nouvelles_non_affichees: nouvelles.reste } : {}),
      ecartees: ecartees.liste.map((x) => sansVides({ id: x.id, titre: x.titre, entreprise: x.entreprise, motif: x.motif })),
      ...(ecartees.reste ? { ecartees_non_affichees: ecartees.reste } : {}),
      doublons: doublons.liste.map((x) => sansVides({ id: x.id, titre: x.titre, statut: x.statut })),
      ...(doublons.reste ? { doublons_non_affiches: doublons.reste } : {}),
    },
    suite: bi({ fr: 'offres_a_lire (résumé paginé), puis lire_offre pour chaque offre à noter.', en: 'offres_a_lire (paged summary), then lire_offre for each job ad to score.' }),
  };
}
