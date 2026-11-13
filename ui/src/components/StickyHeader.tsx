// Copy of the table header, stuck under the application header while the page scrolls.
//
// Why a copy: the table is in a horizontal scroll container, which prevents its own <thead> from
// sticking to the top of the screen (position: sticky then relates to that container). Moving it by script shakes
// on a phone (scrolling is handled outside the JavaScript thread). So the copy is stuck in pure CSS, in a
// zero-height strip placed before the table: the browser holds it in place without script, without shaking.
// The script only: shows the copy when the real header has gone under the top of the screen, copies the
// width of the columns, and carries over the horizontal scrolling of the table (scrollLeft, the stuck column follows).
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

export function StickyHeader({
  tableRef,
  scrollRef,
  lines,
}: {
  tableRef: RefObject<HTMLTableElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Lines of the header (the same as the table's, buttons out of the tab order). */
  lines: ReactNode;
}) {
  const clipRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [widths, setWidths] = useState<{ table: number; columns: number[] }>({ table: 0, columns: [] });

  // Widths of the columns of the real header (data, displayed columns, window that change).
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

  // Display: only when the real header is hidden under the top of the screen and visible lines remain.
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

  // Horizontal scrolling: the copy follows the table; its container also takes data-stuck (shadow of the job title).
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
    // data-stuck changes after the measure of the source container (React render): it is read again at that moment too.
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
