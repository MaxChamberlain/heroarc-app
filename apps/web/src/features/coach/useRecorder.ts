import { useCallback, useEffect, useRef, useState } from 'react';

/** Longest voice note. */
export const MAX_RECORDING_MS = 120_000;

export type RecorderState =
  | { status: 'idle' }
  | { status: 'asking' }
  | { status: 'recording'; ms: number; level: number }
  | { status: 'error'; message: string };

const TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];

function errorMessage(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return "Microphone blocked. Allow it in your browser's site settings, then try again.";
  if (name === 'NotFoundError') return 'No microphone found on this device.';
  return "Couldn't start recording. Try again.";
}

/**
 * Tap-to-record voice notes: start() asks for the mic and records; stop() hands the note to
 * `onDone`; cancel() throws it away. Shows elapsed time and a live input level.
 */
export function useRecorder(onDone: (blob: Blob, ms: number) => void) {
  const [state, setState] = useState<RecorderState>({ status: 'idle' });
  const rec = useRef<{
    recorder: MediaRecorder;
    stream: MediaStream;
    ctx: AudioContext;
    raf: number;
    t0: number;
    cancelled: boolean;
  } | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  const cleanup = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    cancelAnimationFrame(r.raf);
    for (const t of r.stream.getTracks()) t.stop();
    void r.ctx.close().catch(() => {});
    rec.current = null;
  }, []);

  const stop = useCallback(() => {
    const r = rec.current;
    if (r && r.recorder.state !== 'inactive') r.recorder.stop();
  }, []);

  const cancel = useCallback(() => {
    if (rec.current) rec.current.cancelled = true;
    stop();
  }, [stop]);

  const start = useCallback(async () => {
    if (rec.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setState({
        status: 'error',
        message: 'Voice notes need a secure (HTTPS) connection and a recent browser.',
      });
      return;
    }
    setState({ status: 'asking' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const chunks: Blob[] = [];
      const r = { recorder, stream, ctx, raf: 0, t0: performance.now(), cancelled: false };
      rec.current = r;
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const ms = performance.now() - r.t0;
        const cancelled = r.cancelled;
        cleanup();
        setState({ status: 'idle' });
        if (!cancelled && chunks.length)
          done.current(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }), ms);
      };
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        const ms = performance.now() - r.t0;
        setState({ status: 'recording', ms, level: Math.min(1, peak / 64) });
        if (ms >= MAX_RECORDING_MS) recorder.stop();
        else r.raf = requestAnimationFrame(tick);
      };
      recorder.start(250);
      r.raf = requestAnimationFrame(tick);
    } catch (e) {
      cleanup();
      setState({ status: 'error', message: errorMessage(e) });
    }
  }, [cleanup]);

  useEffect(() => cancel, [cancel]);

  return { state, start, stop, cancel, dismiss: () => setState({ status: 'idle' }) };
}

export const clockOf = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
