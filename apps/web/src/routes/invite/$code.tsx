import { createFileRoute } from '@tanstack/react-router';
import { InvitePage } from '../../features/account/AuthPages';

export const Route = createFileRoute('/invite/$code')({
  ssr: false,
  component: function Invite() {
    const { code } = Route.useParams();
    return <InvitePage code={code} />;
  },
});
