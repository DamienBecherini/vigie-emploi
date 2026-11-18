// Drop-down menus (<details data-menu>) of the whole page: a click elsewhere or Escape closes them.
import { useEffect } from 'react';

export function useMenusClose() {
  // Drop-down menus (<details data-menu>): a click elsewhere or Escape closes them.
  useEffect(() => {
    const open = () => document.querySelectorAll<HTMLDetailsElement>('details[data-menu][open]');
    const onClick = (e: MouseEvent) => {
      for (const d of open()) if (!d.contains(e.target as Node)) d.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') for (const d of open()) d.open = false;
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);
}
