import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Markdown } from './Markdown';

const html = (text: string) => renderToStaticMarkup(<Markdown text={text} />);

describe("Coach's Markdown", () => {
  it('formats bold, lists, code and tables', () => {
    expect(html('You hit **140 g** of protein')).toContain('<strong>140 g</strong>');
    expect(html('- eggs\n- toast')).toMatch(/<ul>[\s\S]*<li>eggs<\/li>[\s\S]*<li>toast<\/li>/);
    expect(html('Use `get_day`')).toContain('<code>get_day</code>');
    expect(html('| a | b |\n|---|---|\n| 1 | 2 |')).toContain('<table>');
  });

  it('opens links in a new tab without a window reference', () => {
    expect(html('[Oura](https://ouraring.com)')).toContain(
      '<a href="https://ouraring.com" target="_blank" rel="noopener noreferrer">Oura</a>',
    );
  });

  it('never renders HTML, scripts, unsafe links or outside images', () => {
    const out = html(
      'hi <script>alert(1)</script><b onclick="x()">x</b> [click](javascript:alert(1)) ![t](https://evil.example/p.png)',
    );
    expect(out).not.toContain('<script');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('<b');
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('evil.example');
  });
});
