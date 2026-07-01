import { getMessages } from '../lib/i18n';
import type { AppData, KeyStatus } from '../types';

interface TopBarProps {
  keyStatus: KeyStatus;
  language: AppData['layout']['language'];
  providerLabel: string;
  model: string;
  onToggleCourses: () => void;
  onToggleAi: () => void;
  onToggleStatus: () => void;
}

export function TopBar({ keyStatus, language, providerLabel, model, onToggleCourses, onToggleAi, onToggleStatus }: TopBarProps) {
  const text = getMessages(language);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-dot" />
        <span className="brand-name">TermLearn</span>
        <span className="brand-path">~/syllabus-terminal</span>
      </div>
      <div className="window-actions">
        <button onClick={onToggleCourses} title={text.topCoursesTitle}>{text.topCourses}</button>
        <button onClick={onToggleAi} title={text.topAiTitle}>AI</button>
        <button onClick={onToggleStatus} title={text.topStatusTitle}>{text.topStatus}</button>
        <span className={keyStatus.configured ? 'status-ok' : 'status-warn'}>
          AI: {providerLabel} {keyStatus.configured ? text.configured : text.notConfigured}
        </span>
        <span className="model-chip">{model}</span>
      </div>
    </header>
  );
}
