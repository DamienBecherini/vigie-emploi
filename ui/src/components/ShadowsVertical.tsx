// Ombres en haut et en bas d'une zone qui défile verticalement, visibles seulement quand il reste du contenu caché
// de ce côté : on comprend qu'on peut faire défiler la zone. La zone et ces ombres sont dans un même parent relatif.
import { useEffect, useState, type RefObject } from 'react';

/** Contenu caché en haut / en bas de la zone (suivi au défilement et aux changements de taille). */
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
    // Contenu qui change sans changer la taille de la zone (liste plus longue, déjà à sa hauteur maximale).
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

/** Les deux ombres, à placer après la zone qui défile, dans son parent `relative` (arrondi de la zone : rounded-md). */
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
