import { CARD_IDS } from '@heroarc/contracts';
import { describe, expect, it } from 'vitest';
import { isToolName, TOOLS, toolSchemas } from './tools.js';

describe('agent tool registry', () => {
  it('names match their keys and every tool has a kind, status line and description', () => {
    for (const [key, t] of Object.entries(TOOLS)) {
      expect(t.name).toBe(key);
      expect(['read', 'log', 'change', 'app']).toContain(t.kind);
      expect(t.status.length).toBeGreaterThan(3);
      expect(t.description.length).toBeGreaterThan(20);
    }
  });

  it('gives the model object JSON schemas, in a stable order', () => {
    const a = toolSchemas();
    expect(a.map((t) => t.name)).toEqual(Object.keys(TOOLS));
    for (const t of a) {
      expect(t.input_schema.type).toBe('object');
      expect(t.input_schema).not.toHaveProperty('$schema');
    }
    expect(JSON.stringify(toolSchemas())).toBe(JSON.stringify(a));
  });

  it('gates edits, deletes, goals, habits, plan and layout behind confirmation', () => {
    const change = Object.values(TOOLS)
      .filter((t) => t.kind === 'change')
      .map((t) => t.name)
      .sort();
    expect(change).toEqual([
      'arrange_dashboard',
      'delete_record',
      'edit_habits',
      'edit_plan',
      'edit_record',
      'set_goals',
    ]);
  });

  it('validates inputs (dates, ranges, card ids)', () => {
    expect(TOOLS.log_weight.input.safeParse({ lb: 150.2 }).success).toBe(true);
    expect(TOOLS.log_weight.input.safeParse({ lb: 20 }).success).toBe(false);
    expect(TOOLS.get_day.input.safeParse({ date: '2026-11-27' }).success).toBe(true);
    expect(TOOLS.get_day.input.safeParse({ date: 'yesterday' }).success).toBe(false);
    expect(TOOLS.arrange_dashboard.input.safeParse({ order: [...CARD_IDS] }).success).toBe(true);
    expect(TOOLS.arrange_dashboard.input.safeParse({ order: ['nope'] }).success).toBe(false);
    expect(isToolName('log_meal')).toBe(true);
    expect(isToolName('drop_tables')).toBe(false);
  });
});
