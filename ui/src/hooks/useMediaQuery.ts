// Media queries followed live: narrow screen (filters in a drawer) and dark scheme of the system (theme "system").
import { useEffect, useState } from 'react';

/** Narrow screen (phone, less than 768 px): the filters move into a drawer instead of a column. */
const NARROW_SCREEN = '(max-width: 767px)';

export function useNarrowScreen(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_SCREEN).matches);
  useEffect(() => {
    const media = window.matchMedia(NARROW_SCREEN);
    const updated = () => setNarrow(media.matches);
    media.addEventListener('change', updated);
    return () => media.removeEventListener('change', updated);
  }, []);
  return narrow;
}

export function useDarkSystem(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const updated = () => setDark(media.matches);
    media.addEventListener('change', updated);
    return () => media.removeEventListener('change', updated);
  }, []);
  return dark;
}
