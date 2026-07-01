import { useState } from 'react';
import { getMessages } from '../lib/i18n';
import type { AiModel, AppData, KeyStatus, RuntimeState } from '../types';

interface AiPanelProps {
  data: AppData;
  runtime: RuntimeState;
  keyStatus: KeyStatus;
  onSaveKey: (key: string) => Promise<void>;
  onClearKey: () => Promise<void>;
  onRunCommand: (command: string) => void;
  onToggleStreaming: (enabled: boolean) => void;
  onProviderChange: (provider: AppData['layout']['aiProvider']) => void;
  modelOptions: AiModel[];
  modelError: string;
  onModelChange: (model: string) => void;
  onRefreshModels: () => Promise<void>;
}

export function AiPanel({
  data,
  runtime,
  keyStatus,
  onSaveKey,
  onClearKey,
  onRunCommand,
  onToggleStreaming,
  onProviderChange,
  modelOptions,
  modelError,
  onModelChange,
  onRefreshModels
}: AiPanelProps) {
  const [key, setKey] = useState('');
  const text = getMessages(data.layout.language);
  const lastAttempt = runtime.lastAttemptId
    ? data.attempts.find((item) => item.id === runtime.lastAttemptId)
    : data.attempts[0];

  async function saveKey() {
    if (!key.trim()) {
      return;
    }
    await onSaveKey(key);
    setKey('');
  }

  return (
    <aside className="ai-panel panel">
      <div className="panel-header">
        <span>{text.aiTutor}</span>
        <span className={keyStatus.configured ? 'status-ok' : 'status-warn'}>
          {keyStatus.configured ? 'online' : 'setup'}
        </span>
      </div>

      <section className="ai-section">
        <label>{text.aiProvider}</label>
        <select
          className="provider-select"
          value={data.layout.aiProvider}
          onChange={(event) => onProviderChange(event.target.value as AppData['layout']['aiProvider'])}
        >
          <option value="glm">{text.providerGlm}</option>
          <option value="deepseek">{text.providerDeepSeek}</option>
        </select>
        <small>{text.keyStorage}</small>
        <small>{text.providerVisionHint}</small>
      </section>

      <section className="ai-section">
        <label>{text.aiModel}</label>
        <select
          className="provider-select"
          value={data.layout.aiModel}
          onChange={(event) => onModelChange(event.target.value)}
        >
          {modelOptions.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}{model.vision ? ` · ${text.multimodal}` : ''}
            </option>
          ))}
        </select>
        <div className="inline-actions">
          <button onClick={() => void onRefreshModels()}>{text.refreshModels}</button>
        </div>
        {modelError ? <small className="panel-warning">{modelError}</small> : <small>{text.modelSelectHint}</small>}
      </section>

      <section className="ai-section">
        <label>{text.aiStreaming}</label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={data.layout.aiStreaming}
            onChange={(event) => onToggleStreaming(event.target.checked)}
          />
          <span>{data.layout.aiStreaming ? text.enabled : text.disabled}</span>
        </label>
        <small>{text.aiStreamingHint}</small>
      </section>

      <section className="ai-section">
        <label>{data.layout.aiProvider === 'glm' ? 'GLM API Key' : 'DeepSeek API Key'}</label>
        <input
          type="password"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder={keyStatus.configured ? text.keyConfiguredPlaceholder : 'sk-...'}
        />
        <div className="inline-actions">
          <button onClick={saveKey}>{text.saveKey}</button>
          <button onClick={onClearKey}>{text.clear}</button>
        </div>
      </section>

      <section className="score-card">
        <label>{text.recentScore}</label>
        {lastAttempt ? (
          <>
            <div className="score">
              <strong>{lastAttempt.score}</strong>
              <span>/ {lastAttempt.maxScore}</span>
            </div>
            <p>{lastAttempt.explanation || text.noExplanation}</p>
          </>
        ) : (
          <p>{text.noAttempt}</p>
        )}
      </section>

      <section className="ai-section">
        <label>{text.nextStep}</label>
        <button onClick={() => onRunCommand('explain')}>{text.explainRecent}</button>
        <button onClick={() => onRunCommand('layout focus')}>{text.focusMode}</button>
      </section>
    </aside>
  );
}
