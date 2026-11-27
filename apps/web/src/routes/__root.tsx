/// <reference types="vite/client" />
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { initialTheme, ThemeProvider, ThemeStyles, useTheme } from '../themes/ThemeProvider';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: () => ({ theme: initialTheme() }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width,initial-scale=1,viewport-fit=cover' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-title', content: 'HeroArc' },
      { title: 'HeroArc' },
    ],
    links: [
      { rel: 'manifest', href: '/manifest.json' },
      { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon-180.png' },
      { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/icon-192.png' },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const { theme } = Route.useLoaderData();
  const { queryClient } = Route.useRouteContext();
  return (
    <ThemeProvider initial={theme}>
      <RootDocument>
        <QueryClientProvider client={queryClient}>
          <Outlet />
        </QueryClientProvider>
      </RootDocument>
    </ThemeProvider>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  const { id } = useTheme();
  return (
    <html lang="en" data-theme={id}>
      <head>
        <HeadContent />
        <ThemeStyles />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
