import type { ReactNode } from 'react';

interface MarkdownTextProps {
  text: string;
}

export function MarkdownText({ text }: MarkdownTextProps) {
  const blocks = splitFences(text);
  return (
    <div className="markdown-text">
      {blocks.map((block, index) =>
        block.code ? (
          <pre className="markdown-code" key={index}><code>{block.content}</code></pre>
        ) : (
          renderTextBlock(block.content, index)
        )
      )}
    </div>
  );
}

function splitFences(text: string) {
  const parts: Array<{ code: boolean; content: string }> = [];
  const regex = /```[^\n]*\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text))) {
    if (match.index > lastIndex) {
      parts.push({ code: false, content: text.slice(lastIndex, match.index) });
    }
    parts.push({ code: true, content: match[1] ?? '' });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ code: false, content: text.slice(lastIndex) });
  }

  return parts.length ? parts : [{ code: false, content: text }];
}

function renderTextBlock(text: string, keyPrefix: number) {
  const lines = text.split('\n');
  const nodes: ReactNode[] = [];
  let listItems: ReactNode[] = [];

  function flushList() {
    if (!listItems.length) {
      return;
    }
    nodes.push(<ul className="markdown-list" key={`list-${keyPrefix}-${nodes.length}`}>{listItems}</ul>);
    listItems = [];
  }

  lines.forEach((line, index) => {
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    const list = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    const quote = line.match(/^\s*>\s?(.+)$/);
    const mathBlock = line.match(/^\s*\$\$(.+)\$\$\s*$/);

    if (heading) {
      flushList();
      nodes.push(<div className="markdown-heading" key={`h-${keyPrefix}-${index}`}>{renderInline(heading[2])}</div>);
      return;
    }

    if (list || ordered) {
      const content = list?.[1] ?? ordered?.[1] ?? '';
      listItems.push(<li key={`li-${keyPrefix}-${index}`}>{renderInline(content)}</li>);
      return;
    }

    flushList();
    if (mathBlock) {
      nodes.push(<div className="math-block" key={`m-${keyPrefix}-${index}`}>{mathBlock[1]}</div>);
      return;
    }

    if (quote) {
      nodes.push(<blockquote key={`q-${keyPrefix}-${index}`}>{renderInline(quote[1])}</blockquote>);
      return;
    }

    nodes.push(
      <p className={line.trim() ? undefined : 'markdown-blank'} key={`p-${keyPrefix}-${index}`}>
        {renderInline(line)}
      </p>
    );
  });

  flushList();
  return <div key={`block-${keyPrefix}`}>{nodes}</div>;
}

function renderInline(text: string) {
  const nodes: ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\$[^$]+\$|\\\([^)]+\\\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith('`')) {
      nodes.push(<code key={nodes.length}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={nodes.length}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('\\(')) {
      nodes.push(<span className="math-inline" key={nodes.length}>{token.slice(2, -2)}</span>);
    } else {
      nodes.push(<span className="math-inline" key={nodes.length}>{token.slice(1, -1)}</span>);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}
