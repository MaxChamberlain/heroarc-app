import { createFileRoute } from '@tanstack/react-router';
import legacyPage from '../legacy/index.html?raw';

// The original HeroArc page, unchanged, as the reference while comparing the React port
// (see src/legacy/README.md). It runs on the same API. Remove once the port is signed off.
export const Route = createFileRoute('/legacy')({
  server: {
    handlers: {
      GET: () =>
        new Response(legacyPage.replace('<head>', '<head><base href="/">'), {
          headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' },
        }),
    },
  },
});
