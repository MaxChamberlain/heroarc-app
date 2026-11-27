import { createFileRoute } from '@tanstack/react-router';
import { OnboardingPage } from '../features/account/AuthPages';

export const Route = createFileRoute('/onboarding')({ ssr: false, component: OnboardingPage });
