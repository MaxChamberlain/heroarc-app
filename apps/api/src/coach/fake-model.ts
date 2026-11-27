import type Anthropic from '@anthropic-ai/sdk';
import type { CoachModel, ModelRequest, ModelTurn } from './model.js';

/*
 * A scripted stand-in for Claude (COACH_MODEL=fake): no API calls, deterministic, so the whole
 * Coach pipeline (tools, receipts, Undo, Apply, app actions) can be tested end to end.
 *
 * It understands a few phrases:
 *   "log weight 150.4 [on 2026-11-20]"  → log_weight
 *   "I had <items> for <meal>"         → log_meal (500 kcal; uses the first photo, if any)
 *   "hide the <card> card"             → arrange_dashboard (proposed)
 *   "delete my last weigh-in [on day]" → get_day, then delete_record (proposed)
 *   "show 2026-11-20"                  → show_day
 *   "remember <fact>"                  → remember
 * Anything else gets a short echo.
 */

let seq = 0;
const toolUse = (name: string, input: object): Anthropic.ToolUseBlock =>
  ({
    type: 'tool_use',
    id: `toolu_fake_${++seq}`,
    name,
    input,
    caller: { type: 'direct' },
  }) as never;
const text = (t: string): Anthropic.TextBlock =>
  ({ type: 'text', text: t, citations: null }) as never;

function blocks(m: Anthropic.MessageParam | undefined): Anthropic.ContentBlockParam[] {
  if (!m) return [];
  return typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
}

export class FakeCoachModel implements CoachModel {
  readonly name = 'fake';

  async turn(req: ModelRequest, onText: (delta: string) => void): Promise<ModelTurn> {
    const say = (t: string): ModelTurn => {
      for (const w of t.split(/(?<= )/)) onText(w);
      return { content: [text(t)], stopReason: 'end_turn' };
    };
    const call = (name: string, input: object): ModelTurn => ({
      content: [toolUse(name, input)],
      stopReason: 'tool_use',
    });

    const last = req.messages.at(-1);
    const lastBlocks = blocks(last);
    const results = lastBlocks.filter(
      (b): b is Anthropic.ToolResultBlockParam => b.type === 'tool_result',
    );
    // The user's latest words (the last message with a text block outside <context>).
    const userMsg = [...req.messages]
      .reverse()
      .find(
        (m) =>
          m.role === 'user' &&
          blocks(m).some((b) => b.type === 'text' && !b.text.startsWith('<context>')),
      );
    const userBlocks = blocks(userMsg);
    const said = userBlocks
      .filter(
        (b): b is Anthropic.TextBlockParam => b.type === 'text' && !b.text.startsWith('<context>'),
      )
      .map((b) => b.text)
      .join(' ')
      .trim();
    const context =
      userBlocks.find(
        (b): b is Anthropic.TextBlockParam => b.type === 'text' && b.text.startsWith('<context>'),
      )?.text ?? '';
    const today = context.match(/"Today" means (\d{4}-\d{2}-\d{2})/)?.[1];
    const photo = context.match(/Photos in this message: ([0-9a-f-]{36})/)?.[1];

    if (results.length) {
      const out = results.map((r) => (typeof r.content === 'string' ? r.content : '')).join(' ');
      if (/delete my last weigh-?in/i.test(said) && out.startsWith('{')) {
        const day = JSON.parse(out) as { weigh_ins?: Array<{ id: string }> };
        const w = day.weigh_ins?.at(-1);
        if (w) return call('delete_record', { kind: 'weight', id: w.id });
        return say("You haven't weighed in today.");
      }
      return say(
        out.startsWith('Proposed') ? 'I set that up; tap Apply if it looks right.' : 'Done.',
      );
    }

    let m = said.match(/log (?:my )?weight (\d+(?:\.\d+)?)(?: (?:on|for) (\d{4}-\d{2}-\d{2}))?/i);
    if (m) return call('log_weight', { lb: Number(m[1]), ...(m[2] && { date: m[2] }) });
    m = said.match(/i (?:had|ate) (.+?) for (breakfast|lunch|dinner|a snack)/i);
    if (m) {
      const meal = (m[2] as string).replace('a snack', 'snack');
      return call('log_meal', {
        meal: meal[0]?.toUpperCase() + meal.slice(1),
        items: m[1],
        kcal: 500,
        protein_g: 30,
        carbs_g: 50,
        fat_g: 15,
        confidence: 'Medium',
        ...(photo && { photo_id: photo }),
      });
    }
    m = said.match(/hide the (\w+) card/i);
    if (m) return call('arrange_dashboard', { tiles: [{ card: m[1], hidden: true }] });
    m = said.match(/delete my last weigh-?in(?: (?:on|for) (\d{4}-\d{2}-\d{2}))?/i);
    if (m && (m[1] || today)) return call('get_day', { date: m[1] ?? today });
    m = said.match(/show (\d{4}-\d{2}-\d{2})/i);
    if (m) return call('show_day', { date: m[1] });
    m = said.match(/remember (.+)/i);
    if (m) return call('remember', { text: m[1] });
    return say(`(Test Coach) You said: ${said || 'nothing'}.`);
  }
}
