import Anthropic from '@anthropic-ai/sdk';

/** One model turn: what it said and did, and why it stopped. */
export interface ModelTurn {
  content: Anthropic.ContentBlock[];
  stopReason: Anthropic.StopReason | null;
}

export interface ModelRequest {
  system: Anthropic.TextBlockParam[];
  tools: Anthropic.Tool[];
  messages: Anthropic.MessageParam[];
}

/** The model behind Coach (Claude, or a scripted stand-in for tests). */
export interface CoachModel {
  readonly name: string;
  /** Run one turn, streaming text through `onText`. */
  turn(
    req: ModelRequest,
    onText: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<ModelTurn>;
}

/**
 * Claude via the Messages API, streamed. The system prompt and tools are a stable prefix
 * (cached); top-level cache_control also caches the conversation so far.
 */
export class ClaudeCoachModel implements CoachModel {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly name: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async turn(
    req: ModelRequest,
    onText: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<ModelTurn> {
    for (let attempt = 0; ; attempt++) {
      let streamed = false;
      const stream = this.client.messages.stream(
        {
          model: this.name,
          max_tokens: 16000,
          system: req.system,
          tools: req.tools,
          messages: req.messages,
          cache_control: { type: 'ephemeral' },
        },
        { signal },
      );
      stream.on('text', (delta) => {
        streamed = true;
        onText(delta);
      });
      try {
        const m = await stream.finalMessage();
        return { content: m.content, stopReason: m.stop_reason };
      } catch (err) {
        // A tool input that couldn't be parsed, or a dropped connection, is worth one more try,
        // unless text already reached the user (a retry would repeat it).
        if (err instanceof Anthropic.APIError || streamed || attempt >= 2 || signal?.aborted)
          throw err;
      }
    }
  }
}
