// Shadows at the top and at the bottom of a vertically scrolling area, visible only when hidden content remains
// on that side: one understands that the area can be scrolled. The area and these shadows are in the same relative parent.
import { useEffect, useState, type RefObject } from 'react';

/** Content hidden at the top / bottom of the area (followed on scroll and on size changes). */
export function useShadowsVertical(ref: RefObject<HTMLElement | null>, active = true) {
  const [shadows, setShadows] = useState({ high: false, low: false });
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return setShadows({ high: false, low: false });
    const measure = () => {
      const high = el.scrollTop > 1;
      const low = el.scrollHeight - el.clientHeight - el.scrollTop > 1;
      setShadows((o) => (o.high === high && o.low === low ? o : { high, low }));
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    // Content that changes without changing the size of the area (longer list, already at its maximum height).
    if (el.firstElementChild) obs.observe(el.firstElementChild);
    const mutations = new MutationObserver(measure);
    mutations.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener('scroll', measure);
      obs.disconnect();
      mutations.disconnect();
    };
  }, [ref, active]);
  return shadows;
}

/** The two shadows, to place after the scrolling area, in its `relative` parent (rounding of the area: rounded-md). */
export function ShadowsVertical({ high, low }: { high: boolean; low: boolean }) {
  const shadow =
    'pointer-events-none absolute inset-x-px h-4 from-slate-900/15 to-transparent transition-opacity duration-200 dark:from-black/60';
  return (
    <>
      <div aria-hidden="true" className={`${shadow} top-px rounded-t-md bg-linear-to-b ${high ? 'opacity-100' : 'opacity-0'}`} />
      <div aria-hidden="true" className={`${shadow} bottom-px rounded-b-md bg-linear-to-t ${low ? 'opacity-100' : 'opacity-0'}`} />
    </>
  );
}
