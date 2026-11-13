// Conteneur à défilement horizontal qui montre une ombre sur le bord où il reste du contenu caché (gauche, droite, ou
// les deux) : on comprend qu'on peut faire glisser le tableau, surtout sur téléphone où la barre de défilement est cachée.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

/**
 * Le conteneur qui défile, nommé `group/scroll`, porte `data-gauche` (« true » quand du contenu est caché à gauche)
 * et `data-collee` (« true » quand la colonne marquée `data-colonne-collee` — une cellule `position: sticky` — est
 * réellement collée au bord gauche, c'est-à-dire quand le défilement dépasse sa position naturelle). Cette colonne
 * affiche alors sa propre ombre (`group-data-[stuck=true]/scroll:…`) ; `ombreGauche={false}` retire l'ombre du bord gauche.
 */
export function ScrollHorizontal({
  className,
  shadowLeft = true,
  refContainer,
  children,
}: {
  className?: string;
  shadowLeft?: boolean;
  /** Référence au conteneur qui défile, pour le suivre de l'extérieur (copie collée de l'en-tête). */
  refContainer?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const internal = useRef<HTMLDivElement>(null);
  const ref = refContainer ?? internal;
  const [edges, setEdges] = useState({ left: false, right: false, stuck: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rest = el.scrollWidth - el.clientWidth - el.scrollLeft;
      // Position naturelle de la colonne collée : la fin de la cellule qui la précède (la sienne bouge une fois collée).
      const cell = el.querySelector<HTMLElement>('[data-column-stuck]');
      const before = cell?.previousElementSibling as HTMLElement | null | undefined;
      const natural = before ? before.offsetLeft + before.offsetWidth : 0;
      setEdges((b) => {
        const n = { left: el.scrollLeft > 1, right: rest > 1, stuck: Boolean(cell) && el.scrollLeft > natural + 1 };
        return n.left === b.left && n.right === b.right && n.stuck === b.stuck ? b : n;
      });
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    // Largeur du conteneur (fenêtre) ou du contenu (colonnes affichées, données) qui change.
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    if (el.firstElementChild) obs.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', measure);
      obs.disconnect();
    };
  }, []);
  const shadow = 'pointer-events-none absolute inset-y-px w-8 transition-opacity duration-200';
  return (
    <div className="relative">
      <div ref={ref} className={`group/scroll ${className ?? ''}`} data-left={edges.left} data-stuck={edges.stuck}>
        {children}
      </div>
      {shadowLeft && (
        <div
          aria-hidden="true"
          className={`${shadow} left-px rounded-l-lg bg-linear-to-r from-slate-900/20 to-transparent dark:from-black/70 ${edges.left ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      <div
        aria-hidden="true"
        className={`${shadow} right-px rounded-r-lg bg-linear-to-l from-slate-900/20 to-transparent dark:from-black/70 ${edges.right ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
