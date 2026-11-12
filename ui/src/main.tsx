import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App.tsx';
import { initialiserLangue, useLangue } from './i18n/index.ts';
import './styles.css';

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: true, retry: 1 } },
});

/** Un changement de langue remonte l'application : tous les textes sont recalculés (les données restent en cache). */
function Racine() {
  const langue = useLangue();
  return <App key={langue} />;
}

// La langue est connue avant le premier rendu (pas de bascule visible du français vers l'anglais).
void initialiserLangue().then(() => {
  createRoot(document.getElementById('racine')!).render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <Racine />
      </QueryClientProvider>
    </StrictMode>,
  );
});
