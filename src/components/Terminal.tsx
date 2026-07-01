import { ClipboardEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import type { ImageAttachment, TerminalLine } from '../types';
import { MarkdownText } from './MarkdownText';

interface TerminalProps {
  lines: TerminalLine[];
  onSubmit: (command: string) => void;
  completionCandidates: string[];
  prompt: string;
  attachments: ImageAttachment[];
  onPasteImages: (attachments: ImageAttachment[]) => void;
  onRemoveAttachment: (id: string) => void;
}

export function Terminal({
  lines,
  onSubmit,
  completionCandidates,
  prompt,
  attachments,
  onPasteImages,
  onRemoveAttachment
}: TerminalProps) {
  const [value, setValue] = useState('');
  const viewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number | null>(null);
  const historyDraftRef = useRef('');

  useEffect(() => {
    viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight });
  }, [lines]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const command = value.trim();
    if (!command) {
      return;
    }
    pushHistory(command);
    onSubmit(command);
    historyIndexRef.current = null;
    historyDraftRef.current = '';
    setValue('');
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveHistory(-1);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveHistory(1);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      const completed = completeCommand(value, completionCandidates);
      if (completed) {
        setValue(completed);
      }
    }
  }

  function handleChange(nextValue: string) {
    if (historyIndexRef.current !== null) {
      historyIndexRef.current = null;
      historyDraftRef.current = '';
    }
    setValue(nextValue);
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
    if (!images.length) {
      return;
    }

    event.preventDefault();
    void Promise.all(images.map(fileToAttachment)).then(onPasteImages);
  }

  function pushHistory(command: string) {
    const history = historyRef.current;
    if (history[history.length - 1] !== command) {
      history.push(command);
    }
    historyRef.current = history.slice(-100);
  }

  function moveHistory(direction: -1 | 1) {
    const history = historyRef.current;
    if (!history.length) {
      return;
    }

    if (historyIndexRef.current === null) {
      if (direction === 1) {
        return;
      }
      historyDraftRef.current = value;
      historyIndexRef.current = history.length - 1;
      setValue(history[historyIndexRef.current] ?? '');
      return;
    }

    const nextIndex = historyIndexRef.current + direction;
    if (nextIndex < 0) {
      historyIndexRef.current = 0;
      setValue(history[0] ?? '');
      return;
    }

    if (nextIndex >= history.length) {
      historyIndexRef.current = null;
      setValue(historyDraftRef.current);
      historyDraftRef.current = '';
      return;
    }

    historyIndexRef.current = nextIndex;
    setValue(history[nextIndex] ?? '');
  }

  return (
    <main className="terminal-shell" onClick={() => inputRef.current?.focus()}>
      <div className="terminal-output" ref={viewportRef}>
        {lines.map((line) => (
          <div className={`terminal-line ${line.kind}`} key={line.id}>
            {line.kind === 'command' || line.kind === 'system' || line.kind === 'error' ? (
              <pre>{line.text}</pre>
            ) : (
              <MarkdownText text={line.text} />
            )}
          </div>
        ))}
      </div>
      <form className="terminal-input-row" onSubmit={handleSubmit}>
        <span className="prompt">{prompt}</span>
        {attachments.length > 0 && (
          <div className="attachment-strip">
            {attachments.map((item) => (
              <button type="button" key={item.id} onClick={() => onRemoveAttachment(item.id)}>
                img:{item.name}
              </button>
            ))}
          </div>
        )}
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          autoFocus
        />
      </form>
    </main>
  );
}

function fileToAttachment(file: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        id: `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        name: file.name || 'pasted-image',
        mimeType: file.type,
        dataUrl: String(reader.result)
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function completeCommand(value: string, candidates: string[]) {
  const leadingWhitespace = value.match(/^\s*/)?.[0] ?? '';
  const prefix = value.slice(leadingWhitespace.length);
  const uniqueCandidates = Array.from(new Set(candidates));
  if (!prefix) {
    return leadingWhitespace + (uniqueCandidates[0] || '');
  }

  const matches = uniqueCandidates.filter((candidate) => candidate.startsWith(prefix));
  if (!matches.length) {
    return value;
  }

  if (matches.length === 1) {
    return leadingWhitespace + matches[0];
  }

  const longerMatches = matches.filter((candidate) => candidate.length > prefix.length);
  const longerPrefix = commonPrefix(longerMatches);
  if (longerPrefix && longerPrefix !== prefix) {
    return leadingWhitespace + longerPrefix;
  }

  const sharedPrefix = commonPrefix(matches);
  if (sharedPrefix && sharedPrefix !== prefix) {
    return leadingWhitespace + sharedPrefix;
  }

  return leadingWhitespace + matches[0];
}

function commonPrefix(values: string[]) {
  let prefix = values[0] ?? '';
  for (const value of values.slice(1)) {
    while (!value.startsWith(prefix) && prefix) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}
