import { createFileRoute } from '@tanstack/react-router';
import { BoardPage } from '../features/board/BoardPage';

// The board renders on the client: it depends on the device's width, locale, clock and
// storage. The document, theme and styles are still server-rendered.
export const Route = createFileRoute('/')({ ssr: false, component: BoardPage });
