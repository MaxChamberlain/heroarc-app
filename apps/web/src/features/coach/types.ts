import type { CoachMessage } from '@heroarc/contracts';

/** A photo in the composer: the shrunk JPEG to send, and a small preview. */
export interface CoachImage {
  id: string;
  blob?: Blob;
  thumb: string;
}

/** A voice note in the composer. */
export interface CoachAudio {
  url?: string;
  blob?: Blob;
  ms: number;
}

/** A message as shown: the saved message, plus what only this device has while it's live. */
export interface LiveMessage extends CoachMessage {
  /** Previews before the server has the photos (data URLs). */
  thumbs?: string[];
  /** Playback for a voice note recorded on this device. */
  audioUrl?: string;
  /** Coach is still answering. */
  pending?: boolean;
  /** What Coach is doing right now ("Logging the meal…"). */
  status?: string;
  error?: string;
}
