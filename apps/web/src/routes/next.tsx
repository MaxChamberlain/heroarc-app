import { createFileRoute, redirect } from '@tanstack/react-router';

// The board was previewed at /next before it replaced the old page; keep old links working.
export const Route = createFileRoute('/next')({
  beforeLoad: () => {
    throw redirect({ to: '/' });
  },
});
