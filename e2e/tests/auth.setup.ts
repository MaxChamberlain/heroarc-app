import { expect, test as setup } from '@playwright/test';
import { STATE } from './state.js';

// The demo account `pnpm db:seed` creates (test values from .env.example).
setup('sign in as the demo account', async ({ request, baseURL }) => {
  const res = await request.post('/api/auth/sign-in/username', {
    data: {
      username: process.env.DEMO_USERNAME ?? 'demo',
      password: process.env.DEMO_PASSWORD ?? 'heroarc-demo-password',
    },
    headers: { origin: baseURL ?? '' },
  });
  expect(res.ok(), await res.text()).toBe(true);
  expect((await request.get('/api/v1/me')).ok()).toBe(true);
  await request.storageState({ path: STATE });
});
