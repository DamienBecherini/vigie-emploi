// Boutons « travail en attente pour l'agent » (au-dessus des filtres) et écoute des notifications du serveur.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePenLine, Mail } from 'lucide-react';
import { api, type ActionAgent } from '../api.ts';
import { t, type KeyUi } from '../i18n/index.ts';

/**
 * Écoute le flux du serveur (Server-Sent Events) : la base a changé (CLI, agent, autre onglet) → toutes les
 * données affichées sont rechargées ; la boîte de réception a changé → seul l'état du travail l'est.
 * Le navigateur rétablit seul la connexion si le serveur redémarre.
 */
export function useNotifications(): void {
  const client = useQueryClient();
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const stream = new EventSource('/api/stream');
    const onDatabase = () => void client.invalidateQueries();
    const emails = () => void client.invalidateQueries({ queryKey: ['work'] });
    // Après une reconnexion (serveur redémarré), des modifications ont pu être manquées.
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

/** N'affiche rien tant qu'il n'y a pas de travail en attente. */
export function ActionsAgent({ className = '' }: { className?: string }) {
  const work = useQuery({ queryKey: ['work'], queryFn: api.work });
  const [message, setMessage] = useState('');
  // Évite d'ouvrir deux terminaux sur un double clic : button désactivé quelques secondes après le lancement.
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
