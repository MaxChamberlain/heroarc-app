import { type FormEvent, type RefObject, useEffect, useRef, useState } from 'react';
import { CameraIcon, MicIcon } from '../board/icons';
import { cx } from '../board/lib';
import u from '../board/ui.module.css';
import s from './Coach.module.css';
import { useCoach } from './CoachProvider';
import { downscale, thumbnail } from './images';
import type { CoachAudio, CoachImage } from './types';
import { clockOf, MAX_RECORDING_MS, useRecorder } from './useRecorder';

const MAX_IMAGES = 4;
const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * Write to Coach: text (Enter sends, Shift+Enter for a new line), up to four photos (button,
 * paste, or drop anywhere on the panel) and one voice note (tap the mic, then Done).
 */
export function Composer({ dropTarget }: { dropTarget: RefObject<HTMLElement | null> }) {
  const { send, busy, setFocusTarget, enabled, voice } = useCoach();
  const [text, setText] = useState('');
  const [images, setImages] = useState<CoachImage[]>([]);
  const [audio, setAudio] = useState<CoachAudio>();
  const [note, setNote] = useState('');
  const [dragging, setDragging] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  /** Photos attached or being prepared (state lags while they're being shrunk). */
  const count = useRef(0);
  const rec = useRecorder((blob, ms) => setAudio({ blob, ms, url: URL.createObjectURL(blob) }));
  const recording = rec.state.status === 'recording';

  useEffect(() => {
    setFocusTarget(() => box.current?.focus());
    return () => setFocusTarget(null);
  }, [setFocusTarget]);

  // Grow with the text, up to a limit.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure whenever the text changes.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const addFiles = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    setNote('');
    for (const f of imgs) {
      if (count.current >= MAX_IMAGES) {
        setNote(`Up to ${MAX_IMAGES} photos per message.`);
        break;
      }
      count.current++;
      try {
        const blob = await downscale(f);
        const thumb = await thumbnail(blob);
        setImages((xs) => [...xs, { id: uid(), blob, thumb }]);
      } catch {
        count.current--;
        setNote("Couldn't read that image.");
      }
    }
  };

  // Drop photos anywhere on the Coach panel.
  // biome-ignore lint/correctness/useExhaustiveDependencies: addFiles reads refs; re-binding each render is unnecessary.
  useEffect(() => {
    const el = dropTarget.current;
    if (!el) return;
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (e.target === el) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      void addFiles([...(e.dataTransfer?.files ?? [])]);
    };
    el.addEventListener('dragover', over);
    el.addEventListener('dragleave', leave);
    el.addEventListener('drop', drop);
    return () => {
      el.removeEventListener('dragover', over);
      el.removeEventListener('dragleave', leave);
      el.removeEventListener('drop', drop);
    };
  }, [dropTarget]);

  const empty = !text.trim() && !images.length && !audio;
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy || empty || recording) return;
    const draft = { text, images, audio };
    setText('');
    count.current = 0;
    setImages([]);
    setAudio(undefined);
    setNote('');
    await send(draft);
    box.current?.focus();
  };

  return (
    <form
      className={cx(s.composer, dragging && s.dragging)}
      onSubmit={(e) => void submit(e)}
      data-coach-composer="1"
    >
      {note && (
        <p className={s.note} role="status">
          {note}
        </p>
      )}
      {(images.length > 0 || audio) && (
        <div className={s.attachments}>
          {images.map((img) => (
            <span className={s.thumb} key={img.id}>
              <img src={img.thumb} alt="Attached" />
              <button
                type="button"
                className={s.remove}
                aria-label="Remove photo"
                onClick={() => {
                  count.current--;
                  setImages((xs) => xs.filter((x) => x.id !== img.id));
                  setNote('');
                }}
              >
                ✕
              </button>
            </span>
          ))}
          {audio && (
            <span className={s.voice} data-voice-note="1">
              {/* biome-ignore lint/a11y/useMediaCaption: a voice note the user just recorded. */}
              <audio controls src={audio.url} />
              <small className={s.voiceLen}>{clockOf(audio.ms)}</small>
              <button
                type="button"
                className={s.remove}
                aria-label="Remove voice note"
                onClick={() => setAudio(undefined)}
              >
                ✕
              </button>
            </span>
          )}
        </div>
      )}
      {recording ? (
        <div className={s.recording} role="status" aria-live="polite">
          <i className={s.dot} aria-hidden="true" />
          <span>{`Recording ${clockOf(rec.state.status === 'recording' ? rec.state.ms : 0)} / ${clockOf(MAX_RECORDING_MS)}`}</span>
          <span className={s.level} aria-hidden="true">
            <i
              style={{
                transform: `scaleX(${rec.state.status === 'recording' ? rec.state.level : 0})`,
              }}
            />
          </span>
          <button type="button" className={cx(u.btn, u.small)} onClick={rec.cancel}>
            Cancel
          </button>
          <button
            type="button"
            className={cx(u.primary, u.small)}
            onClick={rec.stop}
            data-rec-done="1"
          >
            Done
          </button>
        </div>
      ) : (
        <textarea
          ref={box}
          className={s.input}
          rows={1}
          value={text}
          placeholder={
            !enabled
              ? 'Coach isn’t set up yet'
              : dragging
                ? 'Drop photos to attach'
                : 'Tell Coach what you ate, or ask anything'
          }
          disabled={!enabled}
          aria-label="Message Coach"
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const files = [...e.clipboardData.files];
            if (files.some((f) => f.type.startsWith('image/'))) {
              e.preventDefault();
              void addFiles(files);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
        />
      )}
      {rec.state.status === 'error' && (
        <p className={s.note} role="alert">
          {rec.state.message}{' '}
          <button type="button" className={u.link} onClick={rec.dismiss}>
            OK
          </button>
        </p>
      )}
      <div className={s.tools}>
        <button
          type="button"
          className={s.tool}
          aria-label="Add photos"
          disabled={recording || images.length >= MAX_IMAGES}
          onClick={() => picker.current?.click()}
        >
          <CameraIcon />
        </button>
        <input
          ref={picker}
          type="file"
          accept="image/*"
          multiple
          hidden
          data-coach-photos="1"
          onChange={(e) => {
            void addFiles([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className={cx(s.tool, recording && s.toolOn)}
          aria-label={recording ? 'Stop recording' : 'Record a voice note'}
          aria-pressed={recording}
          disabled={!voice || !!audio || rec.state.status === 'asking'}
          title={voice ? undefined : 'Voice notes need an OpenAI key on the server'}
          data-coach-mic="1"
          onClick={() => (recording ? rec.stop() : void rec.start())}
        >
          <MicIcon />
        </button>
        <span className={s.hint}>Press / to write from anywhere</span>
        <button
          type="submit"
          className={u.primary}
          disabled={!enabled || busy || empty || recording}
          data-coach-send="1"
        >
          Send
        </button>
      </div>
    </form>
  );
}
