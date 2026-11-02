// Client de l'API locale (mêmes types que le serveur, recopiés ici pour garder l'interface autonome).
import type { Sens, Statut, TypeEvenement } from '../../src/core/statuts.ts';

export interface LigneOffre {
  id: number;
  source: string;
  id_site: string;
  url_canonique: string | null;
  titre: string;
  entreprise: string | null;
  lieu: string | null;
  contrat: string | null;
  remuneration: string | null;
  remuneration_min: number | null;
  remuneration_max: number | null;
  remuneration_unite: string | null;
  teletravail: string | null;
  publiee_le: string | null;
  recue_le: string | null;
  stack: string | null;
  origine: string;
  statut: Statut;
  note: number | null;
  cree_le: string;
  maj_le: string;
  tags: string[];
  a_description: boolean;
}

export interface ResultatListe {
  total: number;
  page: number;
  taille: number;
  pages: number;
  offres: LigneOffre[];
}

export interface Note {
  id: number;
  note_brute: number | null;
  penalites: string | null;
  note: number | null;
  colle: string | null;
  ecarts: string | null;
  lu: boolean;
  grille_version: string | null;
  origine: string;
  notee_le: string;
}

export interface LigneStatut {
  id: number;
  statut: Statut;
  commentaire: string | null;
  origine: string;
  le: string;
}

export interface DetailOffre extends Omit<LigneOffre, 'a_description'> {
  description: string | null;
  notes: Note[];
  statuts: LigneStatut[];
  candidature: Candidature | null;
  evenements: Evenement[];
}

export interface Evenement {
  id: number;
  offre_id: number;
  type: TypeEvenement;
  sens: Sens | null;
  /** AAAA-MM-JJ ou AAAA-MM-JJTHH:MM (heure locale). */
  le: string;
  fait: boolean;
  resume: string;
  details: string | null;
  canal: string | null;
  interlocuteurs: string | null;
  montant: number | null;
  unite: string | null;
  jours: number | null;
  fichiers: string[];
  origine: string;
  cree_le: string;
  maj_le: string | null;
  echeance: boolean;
  en_retard: boolean;
}

export interface EcheanceOffre extends Evenement {
  titre: string;
  entreprise: string | null;
  statut: Statut;
}

export interface Echeances {
  aujourdhui: string;
  jusqua: string;
  en_retard: EcheanceOffre[];
  a_venir: EcheanceOffre[];
}

export interface FichierDossier {
  chemin: string;
  nom: string;
  taille: number;
  modifie_le: string;
}

export interface FichiersDossier {
  offre_id: number;
  dossier: string | null;
  existe: boolean;
  fichiers: FichierDossier[];
  tronque: boolean;
}

export interface Statistiques {
  envoyees: number;
  reponses: number;
  entretiens: number;
  propositions: number;
  delai_moyen_reponse_jours: number | null;
  delai_base: number;
}

/** Saisie d'un événement : null efface un champ facultatif (modification). */
export interface SaisieEvenement {
  type: TypeEvenement;
  sens: Sens | null;
  le: string;
  fait: boolean;
  resume: string;
  details: string | null;
  canal: string | null;
  interlocuteurs: string | null;
  montant: number | null;
  unite: string | null;
  jours: number | null;
  fichiers: string[];
}

/** URL de lecture d'un fichier du dossier de données (chaque segment encodé). */
export function urlFichier(chemin: string): string {
  return `/api/fichier/${chemin.split('/').map(encodeURIComponent).join('/')}`;
}

export interface Candidature {
  dossier: string | null;
  cv: string | null;
  envoyee_le: string | null;
  canal: string | null;
  message: string | null;
  prochaine_action: string | null;
  prochaine_action_origine: string | null;
  libelle: string | null;
  conditions: string | null;
  etat: string | null;
  maj_le: string | null;
}

export interface SaisieNote {
  note: number | null;
  note_brute: number | null;
  penalites: string;
  colle: string;
  ecarts: string;
}

export type SaisieCandidature = Partial<Record<'prochaine_action' | 'envoyee_le' | 'canal' | 'dossier' | 'cv' | 'conditions', string | null>>;

export interface Meta {
  total: number;
  statuts: { valeur: string; n: number }[];
  sources: { valeur: string; n: number }[];
  tags: { valeur: string; n: number }[];
  contrats: { valeur: string; n: number }[];
}

async function appel<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const corps = (await r.json().catch(() => ({}))) as T & { erreur?: string };
  if (!r.ok) throw new Error(corps.erreur ?? `Erreur ${r.status}`);
  return corps;
}

export const api = {
  offres: (params: URLSearchParams) => appel<ResultatListe>(`/api/offres?${params.toString()}`),
  offre: (id: number) => appel<DetailOffre>(`/api/offres/${id}`),
  meta: () => appel<Meta>('/api/meta'),
  statut: (id: number, statut: Statut, commentaire: string) =>
    appel<DetailOffre>(`/api/offres/${id}/statut`, { method: 'POST', body: JSON.stringify({ statut, commentaire }) }),
  tags: (id: number, tags: string[]) =>
    appel<{ tags: string[] }>(`/api/offres/${id}/tags`, { method: 'PUT', body: JSON.stringify({ tags }) }),
  lien: (id: number, url: string | null) =>
    appel<DetailOffre>(`/api/offres/${id}/lien`, { method: 'PUT', body: JSON.stringify({ url }) }),
  noter: (id: number, n: SaisieNote) =>
    appel<DetailOffre>(`/api/offres/${id}/note`, { method: 'POST', body: JSON.stringify(n) }),
  candidature: (id: number, c: SaisieCandidature) =>
    appel<DetailOffre>(`/api/offres/${id}/candidature`, { method: 'PUT', body: JSON.stringify(c) }),
  ajouterEvenement: (id: number, e: SaisieEvenement) =>
    appel<DetailOffre>(`/api/offres/${id}/evenements`, { method: 'POST', body: JSON.stringify(e) }),
  modifierEvenement: (id: number, e: Partial<SaisieEvenement>) =>
    appel<DetailOffre>(`/api/evenements/${id}`, { method: 'PUT', body: JSON.stringify(e) }),
  marquerFait: (id: number, fait: boolean) =>
    appel<DetailOffre>(`/api/evenements/${id}/fait`, { method: 'POST', body: JSON.stringify({ fait }) }),
  supprimerEvenement: (id: number) => appel<DetailOffre>(`/api/evenements/${id}`, { method: 'DELETE' }),
  echeances: (jours = 7) => appel<Echeances>(`/api/echeances?jours=${jours}`),
  fichiers: (id: number) => appel<FichiersDossier>(`/api/offres/${id}/fichiers`),
  statistiques: () => appel<Statistiques>('/api/statistiques'),
  candidater: (id: number) =>
    appel<{ commande: string; offre: DetailOffre }>(`/api/offres/${id}/candidater`, { method: 'POST' }),
};
