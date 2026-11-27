import { createFileRoute } from '@tanstack/react-router';
import { SignInPage } from '../features/account/AuthPages';

export const Route = createFileRoute('/sign-in')({
  ssr: false,
  // Optional input keys keep links to this page free of `search`.
  validateSearch: (s: {
    error?: unknown;
    error_description?: unknown;
  }): { error?: string; error_description?: string } => ({
    error: typeof s.error === 'string' ? s.error : undefined,
    error_description:
      typeof s.error_description === 'string' ? s.error_description.slice(0, 200) : undefined,
  }),
  component: function SignIn() {
    const { error, error_description } = Route.useSearch();
    return <SignInPage error={error} description={error_description} />;
  },
});
