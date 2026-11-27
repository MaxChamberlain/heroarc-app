import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

// Order matters: Start first, React after it. Nitro produces the Node server in .output/.
export default defineConfig({
  server: { port: 3000 },
  plugins: [tanstackStart(), nitro(), viteReact()],
});
