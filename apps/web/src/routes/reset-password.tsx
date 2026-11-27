import { createFileRoute } from '@tanstack/react-router';
import { ResetPasswordPage } from '../features/account/AuthPages';

export const Route = createFileRoute('/reset-password')({
  ssr: false,
  // Optional input keys keep links to this page free of `search`.
  validateSearch: (s: { token?: unknown }): { token?: string } => ({
    token: typeof s.token === 'string' ? s.token : undefined,
  }),
  component: function Reset() {
    const { token } = Route.useSearch();
    return <ResetPasswordPage token={token} />;
  },
});
