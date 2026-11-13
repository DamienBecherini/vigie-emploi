// Copie de l'en-tête du tableau, collée sous l'en-tête de l'application pendant le défilement de la page.
//
// Pourquoi une copie : le tableau est dans un conteneur à défilement horizontal, qui empêche son propre <thead> de
// se coller au haut de l'écran (position: sticky se rapporte alors à ce conteneur). Le déplacer par script tremble
// sur téléphone (le défilement est géré hors du fil JavaScript). La copie est donc collée en pur CSS, dans une
// bande de hauteur nulle placée avant le tableau : le navigateur la tient en place sans script, sans tremblement.
// Le script ne fait que : afficher la copie quand l'en-tête réel est passé sous le haut de l'écran, recopier la
// largeur des colonnes, et reporter le défilement horizontal du tableau (scrollLeft, la colonne collée suit).
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

export function EnteteColle({
  tableRef,
  defilementRef,
  lignes,
}: {
  tableRef: RefObject<HTMLTableElement | null>;
  defilementRef: RefObject<HTMLDivElement | null>;
  /** Lignes de l'en-tête (les mêmes que celles du tableau, boutons hors de l'ordre de tabulation). */
  lignes: ReactNode;
}) {
  const clipRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [largeurs, setLargeurs] = useState<{ table: number; colonnes: number[] }>({ table: 0, colonnes: [] });

  // Largeurs des colonnes de l'en-tête réel (données, colonnes affichées, fenêtre qui changent).
  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const mesurer = () => {
      const cellules = table.tHead?.rows[0]?.cells;
      if (!cellules) return;
      const colonnes = Array.from(cellules, (c) => c.getBoundingClientRect().width);
      const total = table.getBoundingClientRect().width;
      setLargeurs((l) => (l.table === total && l.colonnes.join() === colonnes.join() ? l : { table: total, colonnes }));
    };
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(table);
    if (table.tHead) obs.observe(table.tHead);
    return () => obs.disconnect();
  }, [tableRef]);

  // Affichage : seulement quand l'en-tête réel est caché sous le haut de l'écran et qu'il reste des lignes visibles.
  useEffect(() => {
    let image = 0;
    const evaluer = () => {
      image = 0;
      const table = tableRef.current;
      const thead = table?.tHead;
      if (!table || !thead) return;
      const haut = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--haut-entete')) || 0;
      const r = thead.getBoundingClientRect();
      const bas = table.getBoundingClientRect().bottom;
      setVisible(r.top < haut && bas > haut + 2 * r.height);
    };
    const demander = () => {
      if (!image) image = requestAnimationFrame(evaluer);
    };
    evaluer();
    window.addEventListener('scroll', demander, { passive: true });
    window.addEventListener('resize', demander);
    return () => {
      window.removeEventListener('scroll', demander);
      window.removeEventListener('resize', demander);
      if (image) cancelAnimationFrame(image);
    };
  }, [tableRef]);

  // Défilement horizontal : la copie suit le tableau ; son conteneur reprend aussi data-collee (ombre de l'Intitulé).
  useEffect(() => {
    const source = defilementRef.current;
    const clip = clipRef.current;
    if (!source || !clip || !visible) return;
    const suivre = () => {
      clip.scrollLeft = source.scrollLeft;
      clip.dataset.collee = source.dataset.collee ?? 'false';
    };
    suivre();
    source.addEventListener('scroll', suivre, { passive: true });
    // data-collee change après la mesure du conteneur source (rendu React) : on le relit aussi à ce moment-là.
    const obs = new MutationObserver(suivre);
    obs.observe(source, { attributes: true, attributeFilter: ['data-collee'] });
    return () => {
      source.removeEventListener('scroll', suivre);
      obs.disconnect();
    };
  }, [defilementRef, visible, largeurs]);

  return (
    <div className="sticky z-[3] h-0" style={{ top: 'var(--haut-entete, 0px)' }} aria-hidden="true">
      {visible && (
        <div
          ref={clipRef}
          className="group/defilement absolute inset-x-0 top-0 overflow-hidden rounded-t-lg border border-slate-200 shadow-[0_3px_6px_-3px_rgba(0,0,0,0.3)] dark:border-slate-800 dark:shadow-[0_3px_6px_-2px_rgba(0,0,0,0.9)]"
        >
          <table className="table-fixed border-collapse text-sm" style={{ width: largeurs.table }}>
            <colgroup>
              {largeurs.colonnes.map((l, i) => (
                <col key={i} style={{ width: l }} />
              ))}
            </colgroup>
            <thead className="bg-slate-100 text-left dark:bg-slate-800">{lignes}</thead>
          </table>
        </div>
      )}
    </div>
  );
}
