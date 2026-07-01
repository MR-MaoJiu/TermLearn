import { useCallback, useEffect, useMemo, useState } from 'react';
import { AiPanel } from './components/AiPanel';
import { CoursePanel } from './components/CoursePanel';
import { ImportDialog } from './components/ImportDialog';
import { StatusBar } from './components/StatusBar';
import { Terminal } from './components/Terminal';
import { TopBar } from './components/TopBar';
import { AI_PROVIDER_LABELS, defaultModelForProvider, fallbackModels, modelSupportsImages } from './lib/aiProviders';
import { runCommand, importSyllabus } from './lib/commands';
import { defaultData, uid } from './lib/data';
import { getMessages } from './lib/i18n';
import type { AiModel, AppData, ImageAttachment, KeyStatus, RuntimeState, TerminalLine } from './types';

const INITIAL_BANNER = [
  ' _______                   _                          ',
  '|__   __|                 | |                         ',
  '   | | ___ _ __ _ __ ___  | |     ___  __ _ _ __ _ __ ',
  '   | |/ _ \\ __|  _ ` _ \\ | |    / _ \\/ _` |  __|  _ \\',
  '   | |  __/ |  | | | | | || |___|  __/ (_| | |  | | | |',
  '   |_|\\___|_|  |_| |_| |_||______\\___|\\__,_|_|  |_| |_|'
];

function createInitialLines(): TerminalLine[] {
  return INITIAL_BANNER.map((text) => ({
    id: uid('line'),
    kind: 'system',
    text
  }));
}

const defaultKeyStatus: KeyStatus = {
  configured: false,
  secureStorageAvailable: false
};

export default function App() {
  const [data, setDataState] = useState<AppData>(defaultData);
  const [runtime, setRuntime] = useState<RuntimeState>({});
  const [lines, setLines] = useState<TerminalLine[]>(createInitialLines());
  const [importOpen, setImportOpen] = useState(false);
  const [keyStatus, setKeyStatus] = useState<KeyStatus>(defaultKeyStatus);
  const [pendingAttachments, setPendingAttachments] = useState<ImageAttachment[]>([]);
  const [modelOptions, setModelOptions] = useState<AiModel[]>(fallbackModels('glm'));
  const [modelError, setModelError] = useState<string>('');

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    const storedData = await window.termLearn.getData();
    const normalizedData = {
      ...storedData,
      layout: {
        ...storedData.layout,
        aiModel: normalizeModel(storedData.layout.aiProvider, storedData.layout.aiModel)
      }
    };
    const storedKeyStatus = await window.termLearn.getKeyStatus(normalizedData.layout.aiProvider);
    setDataState(normalizedData);
    setKeyStatus(storedKeyStatus);
    await loadModels(normalizedData.layout.aiProvider, normalizedData.layout.language);
    if (isInitialTerminal(lines)) {
      setLines(createInitialLines());
    }
  }

  const append = useCallback((kind: TerminalLine['kind'], text: string) => {
    const id = uid('line');
    setLines((current) => [...current, { id, kind, text }]);
    return id;
  }, []);

  const updateLine = useCallback((id: string, text: string) => {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, text } : line)));
  }, []);

  const setData = useCallback(async (nextData: AppData) => {
    const saved = await window.termLearn.saveData(nextData);
    setDataState(saved);
  }, []);

  const prompt = useMemo(
    () => createPrompt(runtime.activeCourseId, Boolean(runtime.explainMode)),
    [runtime.activeCourseId, runtime.explainMode]
  );

  const commandContext = useMemo(
    () => ({
      data,
      runtime,
      prompt,
      attachments: pendingAttachments,
      clearAttachments: () => setPendingAttachments([]),
      append,
      updateLine,
      setData,
      setRuntime,
      openImportDialog: () => setImportOpen(true)
    }),
    [append, data, pendingAttachments, prompt, runtime, setData, updateLine]
  );

  async function handleCommand(command: string) {
    if (command === 'clear') {
      setLines([]);
      return;
    }

    await runCommand(command, commandContext);
  }

  async function handleImport(text: string) {
    await importSyllabus(text, commandContext);
  }

  async function handleSaveKey(key: string) {
    const text = getMessages(data.layout.language);
    try {
      const status = await window.termLearn.saveApiKey(data.layout.aiProvider, key);
      setKeyStatus(status);
      await loadModels(data.layout.aiProvider, data.layout.language);
      append('success', text.keySaved);
    } catch (error) {
      append('error', error instanceof Error ? error.message : text.keySaveFailed);
    }
  }

  async function handleClearKey() {
    const text = getMessages(data.layout.language);
    const status = await window.termLearn.clearApiKey(data.layout.aiProvider);
    setKeyStatus(status);
    append('warning', text.keyCleared);
  }

  function updateLayout(partial: Partial<AppData['layout']>) {
    const nextLanguage = partial.language ?? data.layout.language;
    if (partial.language && isInitialTerminal(lines)) {
      setLines(createInitialLines());
    }
    if (partial.language && modelError) {
      setModelError(getMessages(nextLanguage).modelListFallback);
    }

    void setData({
      ...data,
      layout: {
        ...data.layout,
        ...partial,
        focusMode: false
      }
    });
  }

  async function handleProviderChange(aiProvider: AppData['layout']['aiProvider']) {
    updateLayout({ aiProvider, aiModel: defaultModelForProvider(aiProvider) });
    setKeyStatus(await window.termLearn.getKeyStatus(aiProvider));
    await loadModels(aiProvider, data.layout.language);
  }

  function handleModelChange(aiModel: string) {
    updateLayout({ aiModel });
  }

  async function loadModels(aiProvider: AppData['layout']['aiProvider'], language = data.layout.language) {
    try {
      const response = await window.termLearn.listModels(aiProvider);
      setModelOptions(response.models.length ? response.models : fallbackModels(aiProvider));
      setModelError(response.ok ? '' : getMessages(language).modelListFallback);
    } catch {
      setModelOptions(fallbackModels(aiProvider));
      setModelError(getMessages(language).modelListFallback);
    }
  }

  function isInitialTerminal(currentLines: TerminalLine[]) {
    if (currentLines.length !== INITIAL_BANNER.length) {
      return false;
    }

    return currentLines.every((line, index) => line.text === INITIAL_BANNER[index]);
  }

  const layoutClass = [
    'app-shell',
    data.layout.focusMode ? 'focus-mode' : '',
    !data.layout.showCoursePanel ? 'hide-courses' : '',
    !data.layout.showAiPanel ? 'hide-ai' : '',
    !data.layout.showStatusBar ? 'hide-status' : ''
  ]
    .filter(Boolean)
    .join(' ');

  const completionCandidates = useMemo(() => {
    const staticCommands = [
      'help',
      'clear',
      'answer ',
      'explain',
      'explain exit',
      'exit',
      'quit',
      'syllabus import',
      'syllabus list',
      'course list',
      'course enter ',
      'course use ',
      'course create ',
      'lesson start',
      'lesson start ',
      'lesson next',
      'lesson next ',
      'quiz start',
      'quiz start ',
      'exam generate',
      'layout focus',
      'layout restore',
      'settings key set'
    ];
    const courseCommands = data.courses.flatMap((course) => [
      `course enter ${course.id}`,
      `course use ${course.id}`,
      `lesson start ${course.id}`,
      `lesson next ${course.id}`,
      `quiz start ${course.id}`,
      `exam generate ${course.id}`
    ]);
    return [...staticCommands, ...courseCommands];
  }, [data.courses]);

  const visibleModelOptions = useMemo(() => {
    if (modelOptions.some((model) => model.id === data.layout.aiModel)) {
      return modelOptions;
    }

    return [
      {
        id: data.layout.aiModel,
        label: data.layout.aiModel,
        vision: modelSupportsImages(data.layout.aiProvider, data.layout.aiModel)
      },
      ...modelOptions
    ];
  }, [data.layout.aiModel, modelOptions]);

  return (
    <div className={layoutClass}>
      <TopBar
        keyStatus={keyStatus}
        language={data.layout.language}
        providerLabel={AI_PROVIDER_LABELS[data.layout.aiProvider]}
        model={data.layout.aiModel}
        onToggleCourses={() => updateLayout({ showCoursePanel: !data.layout.showCoursePanel })}
        onToggleAi={() => updateLayout({ showAiPanel: !data.layout.showAiPanel })}
        onToggleStatus={() => updateLayout({ showStatusBar: !data.layout.showStatusBar })}
      />
      <div className="workspace">
        {data.layout.showCoursePanel && (
          <CoursePanel
            data={data}
            activeCourseId={runtime.activeCourseId}
            onImport={() => setImportOpen(true)}
            onRunCommand={handleCommand}
          />
        )}
        <Terminal
          lines={lines}
          onSubmit={handleCommand}
          completionCandidates={completionCandidates}
          prompt={prompt}
          attachments={pendingAttachments}
          onPasteImages={(items) => {
            setPendingAttachments((current) => [...current, ...items].slice(-4));
            append('info', getMessages(data.layout.language).imagesAttached(items.length));
          }}
          onRemoveAttachment={(id) => setPendingAttachments((current) => current.filter((item) => item.id !== id))}
        />
        {data.layout.showAiPanel && (
          <AiPanel
            data={data}
            runtime={runtime}
            keyStatus={keyStatus}
            onSaveKey={handleSaveKey}
            onClearKey={handleClearKey}
            onRunCommand={handleCommand}
            onToggleStreaming={(aiStreaming) => updateLayout({ aiStreaming })}
            onProviderChange={handleProviderChange}
            modelOptions={visibleModelOptions}
            modelError={modelError}
            onModelChange={handleModelChange}
            onRefreshModels={() => loadModels(data.layout.aiProvider)}
          />
        )}
      </div>
      {data.layout.showStatusBar && (
        <StatusBar
          data={data}
          runtime={runtime}
          onLanguageChange={(language) => updateLayout({ language })}
        />
      )}
      <ImportDialog
        open={importOpen}
        language={data.layout.language}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
      />
    </div>
  );
}

function createPrompt(activeCourseId: string | undefined, explainMode: boolean) {
  const path = activeCourseId ? `~/${activeCourseId}` : '~';
  return `learner@termlearn:${explainMode ? `${path}/explain` : path}$`;
}

function normalizeModel(provider: AppData['layout']['aiProvider'], model: string | undefined) {
  if (!model) {
    return defaultModelForProvider(provider);
  }

  if (provider === 'deepseek' && model.startsWith('glm-')) {
    return defaultModelForProvider(provider);
  }

  if (provider === 'glm' && model.startsWith('deepseek-')) {
    return defaultModelForProvider(provider);
  }

  return model;
}
