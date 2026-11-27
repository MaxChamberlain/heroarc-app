import { createFileRoute } from '@tanstack/react-router';
import { SignUpPage } from '../features/account/AuthPages';

export const Route = createFileRoute('/sign-up')({ ssr: false, component: SignUpPage });
