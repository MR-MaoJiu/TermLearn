import { FormEvent, useState } from 'react';
import { getMessages } from '../lib/i18n';
import type { AppData } from '../types';

interface ImportDialogProps {
  open: boolean;
  language: AppData['layout']['language'];
  onClose: () => void;
  onImport: (text: string) => Promise<void>;
}

export function ImportDialog({ open, language, onClose, onImport }: ImportDialogProps) {
  const [text, setText] = useState('');
  const messages = getMessages(language);

  if (!open) {
    return null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onImport(text);
    setText('');
    onClose();
  }

  return (
    <div className="dialog-backdrop">
      <form className="dialog" onSubmit={submit}>
        <div className="dialog-title">
          <span>{messages.importDialogTitle}</span>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <p>{messages.importDialogDesc}</p>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={messages.importPlaceholder}
        />
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>{messages.cancel}</button>
          <button type="submit">{messages.importSyllabus}</button>
        </div>
      </form>
    </div>
  );
}
