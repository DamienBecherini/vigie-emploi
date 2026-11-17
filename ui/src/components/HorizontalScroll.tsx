// Horizontal scroll container that shows a shadow on the edge where hidden content remains (left, right, or
// both): one understands that the table can be dragged, especially on a phone where the scroll bar is hidden.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

/**
 * The scrolling container, named `group/scroll`, carries `data-left` ("true" when content is hidden on the left)
 * and `data-stuck` ("true" when the column marked `data-column-stuck` — a `position: sticky` cell — is
 * really stuck to the left edge, that is when the scrolling goes beyond its natural position). That column
 * then displays its own shadow (`group-data-[stuck=true]/scroll:…`); `shadowLeft={false}` removes the left edge shadow.
 */
export function HorizontalScroll({
  className,
  shadowLeft = true,
  refContainer,
  children,
}: {
  className?: string;
  shadowLeft?: boolean;
  /** Reference to the scrolling container, to follow it from outside (stuck copy of the header). */
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
      // Natural position of the stuck column: the end of the cell before it (its own moves once stuck).
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
    // Width of the container (window) or of the content (displayed columns, data) that changes.
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
