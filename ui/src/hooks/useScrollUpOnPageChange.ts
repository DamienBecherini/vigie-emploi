// Page change: once the lines of the new page are shown, scroll back up to the bar above the table if it is out of
// the screen, under the stuck header. Returns the ref of that bar.
import { useEffect, useRef } from 'react';
import type { OffersList } from './useOffersList.ts';

export function useScrollUpOnPageChange(page: number, list: OffersList, lowHeader: () => number) {
  // Bar above the table: target of the scroll-up on page change.
  const barRef = useRef<HTMLDivElement>(null);
  // The scroll-up waits for the lines of the new page (effect below, after the query): a shorter page
  // (often the last one) reduces the height of the document when they arrive, which readjusts the scrolling and would break
  // a scroll-up started too early.
  const previousPage = useRef(page);
  const scrollUpPending = useRef(false);
  if (previousPage.current !== page) {
    previousPage.current = page;
    scrollUpPending.current = true;
  }

  // Page change: once the lines of the new page are displayed (no more data of the old one kept while
  // waiting), if the bar above the table is out of the screen, scroll back up to it, under the stuck header.
  const pageReady = list.data !== undefined && !list.isPlaceholderData;
  // biome-ignore lint/correctness/useExhaustiveDependencies: list.data and page are the triggers (the lines of the new page have arrived)
  useEffect(() => {
    if (!scrollUpPending.current || !pageReady) return;
    scrollUpPending.current = false;
    const bar = barRef.current;
    if (!bar) return;
    const subHeader = lowHeader() + 8;
    const high = bar.getBoundingClientRect().top;
    if (high >= subHeader) return;
    // Immediate jump (no animation): the top of the new page should be visible at once, and an animation is
    // interrupted by the browser when the content height still changes (scroll readjustment).
    window.scrollTo({ top: window.scrollY + high - subHeader, behavior: 'instant' });
  }, [pageReady, list.data, page, lowHeader]);
  return barRef;
}
