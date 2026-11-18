// Views of the header ("all", "to process", "good", "applications"): the filters each one sets, and the one the URL matches.
import { STATUSES_TO_PROCESS } from '../../../src/core/statuses.ts';
import { KEYS_FILTERS, type UpdateParameters } from '../state.ts';

export type Shortcut = 'all' | 'to-process' | 'applications' | 'good';

export function useShortcuts(params: URLSearchParams, update: UpdateParameters, threshold: string, setSearch: (search: string) => void) {
  const shortcut = (name: Shortcut) => {
    const empty = Object.fromEntries([...KEYS_FILTERS, 'page'].map((k) => [k, null])) as Record<string, null>;
    if (name === 'all') update(empty);
    if (name === 'to-process') update({ ...empty, status: STATUSES_TO_PROCESS.join(',') });
    if (name === 'applications') update({ ...empty, applications: '1' });
    if (name === 'good') update({ ...empty, scoreMin: threshold, status: 'scored,go' });
    setSearch('');
  };
  const shortcutActive =
    params.get('applications') === '1'
      ? 'applications'
      : params.get('status') === STATUSES_TO_PROCESS.join(',')
        ? 'to-process'
        : params.get('scoreMin') === threshold && params.get('status') === 'scored,go'
          ? 'good'
          : KEYS_FILTERS.some((k) => params.has(k))
            ? null
            : 'all';
  return { shortcut, shortcutActive };
}
