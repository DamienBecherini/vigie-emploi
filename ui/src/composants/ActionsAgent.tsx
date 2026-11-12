// Boutons « travail en attente pour l'agent » (au-dessus des filtres) et écoute des notifications du serveur.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePenLine, Mail } from 'lucide-react';
import { api, type ActionAgent } from '../api.ts';
import { t, type CleUi } from '../i18n/index.ts';

/**
 * Écoute le flux du serveur (Server-Sent Events) : la base a changé (CLI, agent, autre onglet) → toutes les
 * données affichées sont rechargées ; la boîte de réception a changé → seul l'état du travail l'est.
 * Le navigateur rétablit seul la connexion si le serveur redémarre.
 */
export function useNotifications(): void {
  const client = useQueryClient();
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const flux = new EventSource('/api/flux');
    const base = () => void client.invalidateQueries();
    const emails = () => void client.invalidateQueries({ queryKey: ['travail'] });
    // Après une reconnexion (serveur redémarré), des modifications ont pu être manquées.
    let connecte = false;
    const pret = () => {
      if (connecte) base();
      connecte = true;
    };
    flux.addEventListener('pret', pret);
    flux.addEventListener('base', base);
    flux.addEventListener('emails', emails);
    return () => flux.close();
  }, [client]);
}

const ACTIONS: Record<ActionAgent, CleUi> = {
  'traiter-emails': 'agent.emailsLance',
  'preparer-go': 'agent.goLance',
};

/** N'affiche rien tant qu'il n'y a pas de travail en attente. */
export function ActionsAgent({ className = '' }: { className?: string }) {
  const travail = useQuery({ queryKey: ['travail'], queryFn: api.travail });
  const [message, setMessage] = useState('');
  // Évite d'ouvrir deux terminaux sur un double clic : bouton désactivé quelques secondes après le lancement.
  const [recent, setRecent] = useState<ActionAgent | null>(null);
  const lancer = useMutation({
    mutationFn: api.lancerAgent,
    onSuccess: (_r, action) => {
      setMessage(t(ACTIONS[action]));
      setRecent(action);
      window.setTimeout(() => setRecent(null), 8000);
    },
    onError: () => setMessage(''),
  });

  const emails = travail.data?.emails ?? 0;
  const go = travail.data?.go_a_preparer ?? [];
  if (!emails && !go.length && !message && !lancer.isError) return null;

  return (
    <section aria-label={t('agent.section')} className={`flex flex-col gap-2 ${className}`}>
      {emails > 0 && (
        <button
          type="button"
          className="bouton bouton-actif justify-center"
          disabled={lancer.isPending || recent === 'traiter-emails'}
          onClick={() => lancer.mutate('traiter-emails')}
          title={t('agent.emailsTitre')}
        >
          <Mail className="size-4" aria-hidden="true" /> {t('agent.emails', { n: emails })}
        </button>
      )}
      {go.length > 0 && (
        <button
          type="button"
          className="bouton bouton-actif justify-center"
          disabled={lancer.isPending || recent === 'preparer-go'}
          onClick={() => lancer.mutate('preparer-go')}
          title={t('agent.goTitre', { liste: go.map((o) => t('agent.goOffre', { entreprise: o.entreprise ?? '?', id: o.id })).join(', ') })}
        >
          <FilePenLine className="size-4" aria-hidden="true" /> {t('agent.go', { n: go.length })}
        </button>
      )}
      <p className="text-xs text-slate-700 dark:text-slate-300" role="status">
        {message}
      </p>
      {lancer.isError && (
        <p className="text-xs text-red-700 dark:text-red-400" role="alert">
          {lancer.error.message}
        </p>
      )}
    </section>
  );
}
