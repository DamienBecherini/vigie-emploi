// State of the interface: filters in the URL (shareable, kept on reload), preferences in localStorage.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

export const KEYS_FILTERS = [
  'q',
  'status',
  'source',
  'tag',
  'scoreMin',
  'scoreMax',
  'unscored',
  'contract',
  'remote',
  'receivedFrom',
  'receivedUntil',
  'publishedFrom',
  'publishedUntil',
  'applications',
] as const;

export type KeyFilter = (typeof KEYS_FILTERS)[number];
export type KeyUrl = KeyFilter | 'page' | 'size' | 'sort' | 'order' | 'offer';

const listeners = new Set<() => void>();
const notify = () => {
  for (const f of listeners) f();
};
if (typeof window !== 'undefined') window.addEventListener('popstate', notify);

function subscribe(f: () => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Reactive URL parameters. */
export function useParameters(): [URLSearchParams, (updated: Partial<Record<KeyUrl, string | null>>, history?: boolean) => void] {
  const search = useSyncExternalStore(subscribe, () => window.location.search);
  const params = new URLSearchParams(search);
  const update = useCallback((updated: Partial<Record<KeyUrl, string | null>>, history = false) => {
    const p = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(updated)) {
      if (v === null || v === undefined || v === '') p.delete(k);
      else p.set(k, v);
    }
    const url = `${window.location.pathname}${p.toString() ? `?${p.toString()}` : ''}`;
    if (history) window.history.pushState(null, '', url);
    else window.history.replaceState(null, '', url);
    notify();
  }, []);
  return [params, update];
}

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`vigie-emploi:${key}`);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

/** Persisted preference (theme, zoom, visible columns). */
export function usePreference<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback));
  useEffect(() => {
    try {
      localStorage.setItem(`vigie-emploi:${key}`, typeof value === 'string' ? value : JSON.stringify(value));
    } catch {
      /* stockage indisponible : la préférence vaut pour la session */
    }
  }, [key, value]);
  return [value, setValue];
}

/** localStorage stores strings as they are (readable by the script of index.html). */
export function usePreferenceText(key: string, fallback: string): [string, (v: string) => void] {
  const [value, setValue] = useState<string>(() => {
    try {
      return localStorage.getItem(`vigie-emploi:${key}`) ?? fallback;
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`vigie-emploi:${key}`, value);
    } catch {
      /* ignoré */
    }
  }, [key, value]);
  return [value, setValue];
}

export function useDebounce<T>(value: T, timeout = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), timeout);
    return () => clearTimeout(t);
  }, [value, timeout]);
  return v;
}
