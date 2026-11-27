import { createFileRoute } from '@tanstack/react-router';
import { OnboardingPage } from '../features/account/Onboarding';

export const Route = createFileRoute('/onboarding')({ ssr: false, component: OnboardingPage });
