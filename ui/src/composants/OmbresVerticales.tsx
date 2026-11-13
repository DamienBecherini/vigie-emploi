// Ombres en haut et en bas d'une zone qui défile verticalement, visibles seulement quand il reste du contenu caché
// de ce côté : on comprend qu'on peut faire défiler la zone. La zone et ces ombres sont dans un même parent relatif.
import { useEffect, useState, type RefObject } from 'react';

/** Contenu caché en haut / en bas de la zone (suivi au défilement et aux changements de taille). */
export function useOmbresVerticales(ref: RefObject<HTMLElement | null>, actif = true) {
  const [ombres, setOmbres] = useState({ haut: false, bas: false });
  useEffect(() => {
    const el = ref.current;
    if (!el || !actif) return setOmbres({ haut: false, bas: false });
    const mesurer = () => {
      const haut = el.scrollTop > 1;
      const bas = el.scrollHeight - el.clientHeight - el.scrollTop > 1;
      setOmbres((o) => (o.haut === haut && o.bas === bas ? o : { haut, bas }));
    };
    mesurer();
    el.addEventListener('scroll', mesurer, { passive: true });
    const obs = new ResizeObserver(mesurer);
    obs.observe(el);
    // Contenu qui change sans changer la taille de la zone (liste plus longue, déjà à sa hauteur maximale).
    if (el.firstElementChild) obs.observe(el.firstElementChild);
    const mutations = new MutationObserver(mesurer);
    mutations.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener('scroll', mesurer);
      obs.disconnect();
      mutations.disconnect();
    };
  }, [ref, actif]);
  return ombres;
}

/** Les deux ombres, à placer après la zone qui défile, dans son parent `relative` (arrondi de la zone : rounded-md). */
export function OmbresVerticales({ haut, bas }: { haut: boolean; bas: boolean }) {
  const ombre =
    'pointer-events-none absolute inset-x-px h-4 from-slate-900/15 to-transparent transition-opacity duration-200 dark:from-black/60';
  return (
    <>
      <div aria-hidden="true" className={`${ombre} top-px rounded-t-md bg-linear-to-b ${haut ? 'opacity-100' : 'opacity-0'}`} />
      <div aria-hidden="true" className={`${ombre} bottom-px rounded-b-md bg-linear-to-t ${bas ? 'opacity-100' : 'opacity-0'}`} />
    </>
  );
}
