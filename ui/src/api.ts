// Client de l'API locale (mêmes types que le serveur, recopiés ici pour garder l'interface autonome).
import type { Statut } from '../../src/core/statuts.ts';

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
  candidature: {
    dossier: string | null;
    cv: string | null;
    envoyee_le: string | null;
    canal: string | null;
    message: string | null;
  } | null;
}

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
  candidater: (id: number) =>
    appel<{ commande: string; offre: DetailOffre }>(`/api/offres/${id}/candidater`, { method: 'POST' }),
};
