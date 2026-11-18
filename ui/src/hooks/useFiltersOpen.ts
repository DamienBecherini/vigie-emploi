// Filters shown or hidden: a column remembered on a large screen, a drawer closed by default on a phone
// (closed by Escape, the page behind it does not scroll).
import { useEffect, useState } from 'react';
import { usePreference } from '../state.ts';
import { useNarrowScreen } from './useMediaQuery.ts';

export function useFiltersOpen() {
  // Column of the filters on a large screen (remembered preference); drawer closed by default on a phone.
  const [columnFilters, setColumnFilters] = usePreference<boolean>('filters-open', true);
  const [drawerFilters, setDrawerFilters] = useState(false);
  const narrow = useNarrowScreen();
  const filtersOpen = narrow ? drawerFilters : columnFilters;
  const setFiltersOpen = narrow ? setDrawerFilters : setColumnFilters;
  useEffect(() => {
    if (!narrow || !drawerFilters) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerFilters(false);
    };
    document.addEventListener('keydown', onKey);
    // The page behind the drawer does not scroll.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [narrow, drawerFilters]);
  return { narrow, filtersOpen, setFiltersOpen, setDrawerFilters };
}
