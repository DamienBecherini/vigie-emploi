import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App.tsx';
import { initializeLanguage, useLanguage } from './i18n/index.ts';
import './styles.css';

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: true, retry: 1 } },
});

/** A language change remounts the application: all the texts are recomputed (the data stay in the cache). */
function Root() {
  const language = useLanguage();
  return <App key={language} />;
}

// The language is known before the first render (no visible switch from French to English).
void initializeLanguage().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <Root />
      </QueryClientProvider>
    </StrictMode>,
  );
});
