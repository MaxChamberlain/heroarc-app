import { describe, expect, it } from 'vitest';
import { openApiDocument } from './openapi.js';
import { externalTools, TOOLS } from './tools.js';

describe('outside agents', () => {
  it("get no app actions and none of Coach's own notes", () => {
    const names = externalTools().map((t) => t.name);
    expect(names).not.toContain('remember');
    expect(names).not.toContain('forget');
    expect(names).not.toContain('set_theme');
    expect(names).toContain('log_meal');
    expect(names).toContain('edit_record');
    expect(names.length).toBe(
      Object.values(TOOLS).filter((t) => t.kind !== 'app' && !('coachOnly' in t)).length,
    );
  });

  it('the OpenAPI document has one operation per tool, with its input schema', () => {
    const doc = openApiDocument('https://api.example.com/');
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.servers).toEqual([{ url: 'https://api.example.com' }]);
    const ops = Object.keys(doc.paths).filter((p) => p.startsWith('/api/agent/v1/tools/'));
    expect(ops.length).toBe(externalTools().length);
    const lw = (
      doc.paths as unknown as Record<
        string,
        { post: { requestBody: { content: Record<string, { schema: { properties: object } }> } } }
      >
    )['/api/agent/v1/tools/log_weight'];
    expect(lw?.post.requestBody.content['application/json']?.schema.properties).toHaveProperty(
      'lb',
    );
  });
});
