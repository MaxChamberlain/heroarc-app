import { createFileRoute } from '@tanstack/react-router';
import { ThemeGallery } from '../../features/board/ThemeGallery';

// Review page for the board themes: every card in every theme. Read-only unless you tap.
export const Route = createFileRoute('/dev/themes')({ ssr: false, component: ThemeGallery });
