import OpenAI from 'openai';

/** Turns a voice note into text. */
export interface Transcriber {
  transcribe(audio: File): Promise<string>;
}

/** OpenAI speech-to-text. */
export class OpenAITranscriber implements Transcriber {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async transcribe(audio: File): Promise<string> {
    const r = await this.client.audio.transcriptions.create({ file: audio, model: this.model });
    return r.text.trim();
  }
}

/** For tests (COACH_MODEL=fake): every voice note says the same thing. */
export class FakeTranscriber implements Transcriber {
  async transcribe(): Promise<string> {
    return 'This is a test voice note.';
  }
}
