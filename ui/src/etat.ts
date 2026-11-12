// État de l'interface : filtres dans l'URL (partageables, conservés au rechargement), préférences dans localStorage.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

export const CLES_FILTRES = [
  'q',
  'statut',
  'source',
  'tag',
  'noteMin',
  'noteMax',
  'sansNote',
  'contrat',
  'teletravail',
  'recueDepuis',
  'recueJusqua',
  'publieeDepuis',
  'publieeJusqua',
  'candidatures',
] as const;

export type CleFiltre = (typeof CLES_FILTRES)[number];
export type CleUrl = CleFiltre | 'page' | 'taille' | 'tri' | 'ordre' | 'offre';

const auditeurs = new Set<() => void>();
const notifier = () => auditeurs.forEach((f) => f());
if (typeof window !== 'undefined') window.addEventListener('popstate', notifier);

function abonner(f: () => void) {
  auditeurs.add(f);
  return () => auditeurs.delete(f);
}

/** Paramètres d'URL réactifs. */
export function useParametres(): [URLSearchParams, (maj: Partial<Record<CleUrl, string | null>>, historique?: boolean) => void] {
  const recherche = useSyncExternalStore(abonner, () => window.location.search);
  const params = new URLSearchParams(recherche);
  const modifier = useCallback((maj: Partial<Record<CleUrl, string | null>>, historique = false) => {
    const p = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(maj)) {
      if (v === null || v === undefined || v === '') p.delete(k);
      else p.set(k, v);
    }
    const url = `${window.location.pathname}${p.toString() ? `?${p.toString()}` : ''}`;
    if (historique) window.history.pushState(null, '', url);
    else window.history.replaceState(null, '', url);
    notifier();
  }, []);
  return [params, modifier];
}

function lire<T>(cle: string, defaut: T): T {
  try {
    const v = localStorage.getItem(`postuler-juste:${cle}`);
    return v === null ? defaut : (JSON.parse(v) as T);
  } catch {
    return defaut;
  }
}

/** Préférence persistée (thème, zoom, colonnes visibles). */
export function usePreference<T>(cle: string, defaut: T): [T, (v: T) => void] {
  const [valeur, setValeur] = useState<T>(() => lire(cle, defaut));
  useEffect(() => {
    try {
      localStorage.setItem(`postuler-juste:${cle}`, typeof valeur === 'string' ? valeur : JSON.stringify(valeur));
    } catch {
      /* stockage indisponible : la préférence vaut pour la session */
    }
  }, [cle, valeur]);
  return [valeur, setValeur];
}

/** localStorage stocke les chaînes telles quelles (lisibles par le script de index.html). */
export function usePreferenceTexte(cle: string, defaut: string): [string, (v: string) => void] {
  const [valeur, setValeur] = useState<string>(() => {
    try {
      return localStorage.getItem(`postuler-juste:${cle}`) ?? defaut;
    } catch {
      return defaut;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`postuler-juste:${cle}`, valeur);
    } catch {
      /* ignoré */
    }
  }, [cle, valeur]);
  return [valeur, setValeur];
}

export function useDebounce<T>(valeur: T, delai = 300): T {
  const [v, setV] = useState(valeur);
  useEffect(() => {
    const t = setTimeout(() => setV(valeur), delai);
    return () => clearTimeout(t);
  }, [valeur, delai]);
  return v;
}
