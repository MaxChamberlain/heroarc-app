import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { Channel } from './channel.js';
import { FakeCoachModel } from './fake-model.js';

const ctx =
  '<context>\nNow: Friday 2026-11-27, 9:00 AM (America/Denver). "Today" means 2026-11-27.\n</context>';
const user = (text: string): Anthropic.MessageParam => ({
  role: 'user',
  content: [
    { type: 'text', text: ctx },
    { type: 'text', text },
  ],
});

describe('FakeCoachModel (the scripted stand-in for tests)', () => {
  const model = new FakeCoachModel();
  const req = (messages: Anthropic.MessageParam[]) => ({ system: [], tools: [], messages });

  it('turns "log weight N" into a log_weight call', async () => {
    const t = await model.turn(req([user('log weight 150.4')]), () => {});
    expect(t.stopReason).toBe('tool_use');
    expect(t.content[0]).toMatchObject({
      type: 'tool_use',
      name: 'log_weight',
      input: { lb: 150.4 },
    });
  });

  it('looks a day up, then proposes deleting the last weigh-in', async () => {
    const first = await model.turn(req([user('delete my last weigh-in')]), () => {});
    const use = first.content[0] as Anthropic.ToolUseBlock;
    expect(use).toMatchObject({ name: 'get_day', input: { date: '2026-11-27' } });
    const second = await model.turn(
      req([
        user('delete my last weigh-in'),
        { role: 'assistant', content: first.content as Anthropic.ContentBlockParam[] },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: use.id,
              content: JSON.stringify({ weigh_ins: [{ id: 'w1' }, { id: 'w2' }] }),
            },
          ],
        },
      ]),
      () => {},
    );
    expect(second.content[0]).toMatchObject({
      name: 'delete_record',
      input: { kind: 'weight', id: 'w2' },
    });
  });

  it('streams a plain reply as text', async () => {
    const out: string[] = [];
    const t = await model.turn(req([user('hello there')]), (d) => out.push(d));
    expect(t.stopReason).toBe('end_turn');
    expect(out.join('')).toContain('hello there');
  });
});

describe('Channel', () => {
  it('delivers pushed items in order, then ends when closed', async () => {
    const c = new Channel<number>();
    c.push(1);
    setTimeout(() => {
      c.push(2);
      c.close();
    }, 5);
    const got: number[] = [];
    for await (const x of c) got.push(x);
    expect(got).toEqual([1, 2]);
  });
});
