import { createFileRoute } from '@tanstack/react-router';
import { VerifyPage } from '../features/account/AuthPages';

export const Route = createFileRoute('/verify')({
  ssr: false,
  // Optional input keys keep links to this page free of `search`.
  validateSearch: (s: { email?: unknown }): { email?: string } => ({
    email: typeof s.email === 'string' ? s.email : undefined,
  }),
  component: function Verify() {
    const { email } = Route.useSearch();
    return <VerifyPage email={email} />;
  },
});
