// Copie de l'en-tête du tableau, collée sous l'en-tête de l'application pendant le défilement de la page.
//
// Pourquoi une copie : le tableau est dans un conteneur à défilement horizontal, qui empêche son propre <thead> de
// se coller au haut de l'écran (position: sticky se rapporte alors à ce conteneur). Le déplacer par script tremble
// sur téléphone (le défilement est géré hors du fil JavaScript). La copie est donc collée en pur CSS, dans une
// bande de hauteur nulle placée avant le tableau : le navigateur la tient en place sans script, sans tremblement.
// Le script ne fait que : afficher la copie quand l'en-tête réel est passé sous le haut de l'écran, recopier la
// largeur des colonnes, et reporter le défilement horizontal du tableau (scrollLeft, la colonne collée suit).
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

export function StickyHeader({
  tableRef,
  scrollRef,
  lines,
}: {
  tableRef: RefObject<HTMLTableElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Lignes de l'en-tête (les mêmes que celles du tableau, boutons hors de l'ordre de tabulation). */
  lines: ReactNode;
}) {
  const clipRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [widths, setWidths] = useState<{ table: number; columns: number[] }>({ table: 0, columns: [] });

  // Largeurs des colonnes de l'en-tête réel (données, colonnes affichées, fenêtre qui changent).
  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const measure = () => {
      const cells = table.tHead?.rows[0]?.cells;
      if (!cells) return;
      const columns = Array.from(cells, (c) => c.getBoundingClientRect().width);
      const total = table.getBoundingClientRect().width;
      setWidths((l) => (l.table === total && l.columns.join() === columns.join() ? l : { table: total, columns }));
    };
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(table);
    if (table.tHead) obs.observe(table.tHead);
    return () => obs.disconnect();
  }, [tableRef]);

  // Affichage : seulement quand l'en-tête réel est caché sous le haut de l'écran et qu'il reste des lignes visibles.
  useEffect(() => {
    let image = 0;
    const evaluate = () => {
      image = 0;
      const table = tableRef.current;
      const thead = table?.tHead;
      if (!table || !thead) return;
      const high = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 0;
      const r = thead.getBoundingClientRect();
      const low = table.getBoundingClientRect().bottom;
      setVisible(r.top < high && low > high + 2 * r.height);
    };
    const ask = () => {
      if (!image) image = requestAnimationFrame(evaluate);
    };
    evaluate();
    window.addEventListener('scroll', ask, { passive: true });
    window.addEventListener('resize', ask);
    return () => {
      window.removeEventListener('scroll', ask);
      window.removeEventListener('resize', ask);
      if (image) cancelAnimationFrame(image);
    };
  }, [tableRef]);

  // Défilement horizontal : la copie suit le tableau ; son conteneur reprend aussi data-collee (ombre de l'Intitulé).
  useEffect(() => {
    const source = scrollRef.current;
    const clip = clipRef.current;
    if (!source || !clip || !visible) return;
    const track = () => {
      clip.scrollLeft = source.scrollLeft;
      clip.dataset.stuck = source.dataset.stuck ?? 'false';
    };
    track();
    source.addEventListener('scroll', track, { passive: true });
    // data-collee change après la mesure du conteneur source (rendu React) : on le relit aussi à ce moment-là.
    const obs = new MutationObserver(track);
    obs.observe(source, { attributes: true, attributeFilter: ['data-stuck'] });
    return () => {
      source.removeEventListener('scroll', track);
      obs.disconnect();
    };
  }, [scrollRef, visible, widths]);

  return (
    <div className="sticky z-[3] h-0" style={{ top: 'var(--header-height, 0px)' }} aria-hidden="true">
      {visible && (
        <div
          ref={clipRef}
          className="group/scroll absolute inset-x-0 top-0 overflow-hidden rounded-t-lg border border-slate-200 shadow-[0_3px_6px_-3px_rgba(0,0,0,0.3)] dark:border-slate-800 dark:shadow-[0_3px_6px_-2px_rgba(0,0,0,0.9)]"
        >
          <table className="table-fixed border-collapse text-sm" style={{ width: widths.table }}>
            <colgroup>
              {widths.columns.map((l, i) => (
                <col key={i} style={{ width: l }} />
              ))}
            </colgroup>
            <thead className="bg-slate-100 text-left dark:bg-slate-800">{lines}</thead>
          </table>
        </div>
      )}
    </div>
  );
}
