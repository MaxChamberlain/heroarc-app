import { createFileRoute } from '@tanstack/react-router';
import { ConsentPage } from '../../features/account/AuthPages';

// Where Better Auth sends an app's OAuth request (Claude, ChatGPT…) for the user's OK.
export const Route = createFileRoute('/connect/consent')({ ssr: false, component: ConsentPage });
