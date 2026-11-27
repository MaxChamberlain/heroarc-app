import type { CoachEvent } from '@heroarc/contracts';
import { api } from '../../lib/orpc';

/** What the composer sends. */
export interface CoachRequest {
  chatId?: string;
  text: string;
  images: Blob[];
  audio?: Blob;
  audioMs?: number;
}

const asFile = (b: Blob, name: string) =>
  b instanceof File ? b : new File([b], name, { type: b.type });

/**
 * Send a message to Coach and stream the reply (POST /api/v1/coach/send; photos and the voice
 * note go up as multipart form data, the reply comes back as server-sent events).
 */
export async function* sendMessage(
  req: CoachRequest,
  signal?: AbortSignal,
): AsyncGenerator<CoachEvent> {
  const ext = req.audio?.type.includes('mp4')
    ? 'm4a'
    : req.audio?.type.includes('ogg')
      ? 'ogg'
      : 'webm';
  const stream = await api.coach.send(
    {
      ...(req.chatId && { chatId: req.chatId }),
      text: req.text,
      ...(req.images.length && {
        images: req.images.map((b, i) => asFile(b, `photo-${i + 1}.jpg`)),
      }),
      ...(req.audio && {
        audio: asFile(req.audio, `voice-note.${ext}`),
        audioMs: Math.round(req.audioMs ?? 0),
      }),
    },
    { signal },
  );
  for await (const ev of stream) yield ev;
}

export const photoUrl = (id: string) => `/api/v1/coach/attachments/${id}`;
