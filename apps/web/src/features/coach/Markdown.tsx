import type { ComponentProps } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import s from './Coach.module.css';

const components: ComponentProps<typeof ReactMarkdown>['components'] = {
  // Links open outside the app, without handing it a window reference.
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

/**
 * Coach's replies as Markdown (bold, lists, links, code, tables). Safe for model text: raw HTML
 * is dropped, unsafe link schemes (javascript:…) are removed by react-markdown, and images are
 * not loaded (a reply can't pull in outside content).
 */
export function Markdown({ text }: { text: string }) {
  return (
    <div className={s.md}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        skipHtml
        disallowedElements={['img']}
        unwrapDisallowed
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
