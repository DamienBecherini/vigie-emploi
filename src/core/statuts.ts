// Statuts d'une offre, partagés par la CLI, l'API et l'interface (aucune dépendance Node ici).

export const STATUTS = [
  'nouvelle',
  'a-lire',
  'notee',
  'ecartee',
  'go',
  'envoyee',
  'relancee',
  'entretien',
  'refus',
  'close',
  'abandonnee',
] as const;

export type Statut = (typeof STATUTS)[number];

export const LIBELLES_STATUTS: Record<Statut, string> = {
  nouvelle: 'Nouvelle',
  'a-lire': 'À lire',
  notee: 'Notée',
  ecartee: 'Écartée',
  go: 'Go',
  envoyee: 'Envoyée',
  relancee: 'Relancée',
  entretien: 'Entretien',
  refus: 'Refus',
  close: 'Close',
  abandonnee: 'Abandonnée',
};

/** « Mes candidatures » : statuts envoyee et suivants. */
export const STATUTS_CANDIDATURE: Statut[] = ['envoyee', 'relancee', 'entretien', 'refus', 'close'];

/** Offres à lire et noter. */
export const STATUTS_A_TRAITER: Statut[] = ['nouvelle', 'a-lire'];

export function estStatut(s: string): s is Statut {
  return (STATUTS as readonly string[]).includes(s);
}

/** Colonnes triables de la liste des offres. */
export const COLONNES_TRI = [
  'id',
  'note',
  'recue_le',
  'publiee_le',
  'titre',
  'entreprise',
  'lieu',
  'contrat',
  'source',
  'statut',
  'remuneration_min',
  'teletravail',
  'maj_le',
] as const;
export type ColonneTri = (typeof COLONNES_TRI)[number];
