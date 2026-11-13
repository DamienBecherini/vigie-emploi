// Conteneur à défilement horizontal qui montre une ombre sur le bord où il reste du contenu caché (gauche, droite, ou
// les deux) : on comprend qu'on peut faire glisser le tableau, surtout sur téléphone où la barre de défilement est cachée.
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function DefilementHorizontal({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [bords, setBords] = useState({ gauche: false, droite: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mesurer = () => {
      const reste = el.scrollWidth - el.clientWidth - el.scrollLeft;
      setBords((b) => {
        const n = { gauche: el.scrollLeft > 1, droite: reste > 1 };
        return n.gauche === b.gauche && n.droite === b.droite ? b : n;
      });
    };
    mesurer();
    el.addEventListener('scroll', mesurer, { passive: true });
    // Largeur du conteneur (fenêtre) ou du contenu (colonnes affichées, données) qui change.
    const obs = new ResizeObserver(mesurer);
    obs.observe(el);
    if (el.firstElementChild) obs.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', mesurer);
      obs.disconnect();
    };
  }, []);
  const ombre = 'pointer-events-none absolute inset-y-px w-8 transition-opacity duration-200';
  return (
    <div className="relative">
      <div ref={ref} className={className}>
        {children}
      </div>
      <div
        aria-hidden="true"
        className={`${ombre} left-px rounded-l-lg bg-linear-to-r from-slate-900/20 to-transparent dark:from-black/70 ${bords.gauche ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        aria-hidden="true"
        className={`${ombre} right-px rounded-r-lg bg-linear-to-l from-slate-900/20 to-transparent dark:from-black/70 ${bords.droite ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
