import { defineConfig } from 'vitest/config';

// Unit tests for server-side helpers and small render checks (renderToStaticMarkup, no DOM);
// no Start/Nitro plugins needed.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
});
