// Button of the header bar that reloads all the data from the database (changes made by the CLI or an AI).
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { t } from '../i18n/index.ts';

/** Reloads all the data from the database (changes made by the CLI or an AI). */
export function ButtonRefresh() {
  const client = useQueryClient();
  const inProgress = useIsFetching() > 0;
  return (
    <button
      type="button"
      className="button"
      onClick={() => client.invalidateQueries()}
      aria-label={t('header.refresh')}
      title={t('header.refresh')}
      aria-busy={inProgress}
    >
      <RefreshCw className={`size-4 ${inProgress ? 'animate-spin' : ''}`} aria-hidden="true" />
    </button>
  );
}
