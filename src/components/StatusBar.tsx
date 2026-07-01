import { getMessages } from '../lib/i18n';
import type { AppData, RuntimeState } from '../types';

interface StatusBarProps {
  data: AppData;
  runtime: RuntimeState;
  onLanguageChange: (language: AppData['layout']['language']) => void;
}

export function StatusBar({ data, runtime, onLanguageChange }: StatusBarProps) {
  const activeCourse = data.courses.find((item) => item.id === runtime.activeCourseId);
  const language = data.layout.language;
  const text = getMessages(language);

  return (
    <footer className="statusbar">
      <span>{text.session}: local</span>
      <span>{text.courseCount}: {data.courses.length}</span>
      <span>{text.currentCourse}: {activeCourse?.title || text.none}</span>
      <span>{text.mode}: {data.layout.focusMode ? text.terminalMode : text.workspaceMode}</span>
      <span>{text.complete}: Tab</span>
      <span className="language-switch">
        <span>{text.language}:</span>
        <button className={language === 'zh' ? 'active' : ''} onClick={() => onLanguageChange('zh')}>中文</button>
        <button className={language === 'en' ? 'active' : ''} onClick={() => onLanguageChange('en')}>EN</button>
      </span>
    </footer>
  );
}
