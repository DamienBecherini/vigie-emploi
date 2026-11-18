// Text of the search field: written into the URL (?q=) after a typing pause, back to the first page.
import { useEffect, useState } from 'react';
import { useDebounce, type UpdateParameters } from '../state.ts';

export function useSearch(params: URLSearchParams, update: UpdateParameters): [string, (search: string) => void] {
  const [search, setSearch] = useState(params.get('q') ?? '');
  const searchDeferred = useDebounce(search, 300);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the debounced search changes, not when the URL does (it would write the old search back)
  useEffect(() => {
    if ((params.get('q') ?? '') !== searchDeferred) update({ q: searchDeferred || null, page: null });
  }, [searchDeferred]);

  return [search, setSearch];
}
