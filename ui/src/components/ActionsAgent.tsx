// "Pending work for the agent" buttons (above the filters) and listening to the server's notifications.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePenLine, Mail } from 'lucide-react';
import { api, type ActionAgent } from '../api.ts';
import { t, type KeyUi } from '../i18n/index.ts';

/**
 * Listens to the server's stream (Server-Sent Events): the database changed (CLI, agent, other tab) → all the
 * displayed data are reloaded; the inbox changed → only the work state is.
 * The browser restores the connection by itself if the server restarts.
 */
export function useNotifications(): void {
  const client = useQueryClient();
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const stream = new EventSource('/api/stream');
    const onDatabase = () => void client.invalidateQueries();
    const emails = () => void client.invalidateQueries({ queryKey: ['work'] });
    // After a reconnection (server restarted), changes may have been missed.
    let connected = false;
    const ready = () => {
      if (connected) onDatabase();
      connected = true;
    };
    stream.addEventListener('ready', ready);
    stream.addEventListener('database', onDatabase);
    stream.addEventListener('emails', emails);
    return () => stream.close();
  }, [client]);
}

const ACTIONS: Record<ActionAgent, KeyUi> = {
  'process-emails': 'agent.emailsLaunched',
  'prepare-go': 'agent.goLaunched',
};

/** Displays nothing as long as there is no pending work. */
export function ActionsAgent({ className = '' }: { className?: string }) {
  const work = useQuery({ queryKey: ['work'], queryFn: api.work });
  const [message, setMessage] = useState('');
  // Avoids opening two terminals on a double click: button disabled for a few seconds after the launch.
  const [recent, setRecent] = useState<ActionAgent | null>(null);
  const launch = useMutation({
    mutationFn: api.launchAgent,
    onSuccess: (_r, action) => {
      setMessage(t(ACTIONS[action]));
      setRecent(action);
      window.setTimeout(() => setRecent(null), 8000);
    },
    onError: () => setMessage(''),
  });

  const emails = work.data?.emails ?? 0;
  const go = work.data?.go_to_prepare ?? [];
  if (!emails && !go.length && !message && !launch.isError) return null;

  return (
    <section aria-label={t('agent.section')} className={`flex flex-col gap-2 ${className}`}>
      {emails > 0 && (
        <button
          type="button"
          className="button button-active justify-center"
          disabled={launch.isPending || recent === 'process-emails'}
          onClick={() => launch.mutate('process-emails')}
          title={t('agent.emailsTitle')}
        >
          <Mail className="size-4" aria-hidden="true" /> {t('agent.emails', { n: emails })}
        </button>
      )}
      {go.length > 0 && (
        <button
          type="button"
          className="button button-active justify-center"
          disabled={launch.isPending || recent === 'prepare-go'}
          onClick={() => launch.mutate('prepare-go')}
          title={t('agent.goTitle', { list: go.map((o) => t('agent.goOffer', { company: o.company ?? '?', id: o.id })).join(', ') })}
        >
          <FilePenLine className="size-4" aria-hidden="true" /> {t('agent.go', { n: go.length })}
        </button>
      )}
      <p className="text-xs text-slate-700 dark:text-slate-300" role="status">
        {message}
      </p>
      {launch.isError && (
        <p className="text-xs text-red-700 dark:text-red-400" role="alert">
          {launch.error.message}
        </p>
      )}
    </section>
  );
}
