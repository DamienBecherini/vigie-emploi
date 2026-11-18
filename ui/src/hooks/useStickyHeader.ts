// Stuck part of the application header: its height in the CSS variable --header-height (the stuck copy of the
// table header goes under it) and its lower edge (target of the scroll-up on page change).
import { useCallback, useEffect, useRef } from 'react';

export function useStickyHeader() {
  // Layout landmarks: header of the application and its stuck row in a narrow window.
  const headerRef = useRef<HTMLElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  /** Stuck part of the header: the whole header on a large screen, the search row in a narrow window. */
  const partStuck = useCallback(() => {
    const header = headerRef.current;
    return header && getComputedStyle(header).display !== 'contents' ? header : lineRef.current;
  }, []);
  const lowHeader = useCallback(() => partStuck()?.getBoundingClientRect().bottom ?? 0, [partStuck]);
  // Height of the stuck part in --header-height: the stuck copy of the table header goes under it (CSS).
  useEffect(() => {
    const updated = () => document.documentElement.style.setProperty('--header-height', `${partStuck()?.offsetHeight ?? 0}px`);
    updated();
    const obs = new ResizeObserver(updated);
    for (const el of [headerRef.current, lineRef.current]) if (el) obs.observe(el);
    window.addEventListener('resize', updated);
    return () => {
      obs.disconnect();
      window.removeEventListener('resize', updated);
    };
  }, [partStuck]);
  return { headerRef, lineRef, lowHeader };
}
