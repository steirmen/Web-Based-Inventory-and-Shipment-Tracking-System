import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { AppearanceProvider } from './appearance-provider';
import { I18nProvider } from './i18n-provider';
import { createQueryClient } from './query-client';

/** App-wide React context providers. Add new global providers here. */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AppearanceProvider>{children}</AppearanceProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
