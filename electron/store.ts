import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AiProvider, AppData, KeyStatus, LayoutState } from './types';

const DEFAULT_LAYOUT: LayoutState = {
  focusMode: false,
  showCoursePanel: true,
  showAiPanel: true,
  showStatusBar: true,
  language: 'zh',
  aiStreaming: true,
  aiProvider: 'glm',
  aiModel: 'glm-4.5v'
};

const DEFAULT_DATA: AppData = {
  syllabi: [],
  courses: [],
  lessons: [],
  attempts: [],
  layout: DEFAULT_LAYOUT
};

function ensureDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function dataFile() {
  return path.join(app.getPath('userData'), 'termlearn-data.json');
}

function keyFile(provider: AiProvider) {
  return path.join(app.getPath('userData'), `${provider}-key.bin`);
}

export function readAppData(): AppData {
  const file = dataFile();
  if (!fs.existsSync(file)) {
    return DEFAULT_DATA;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<AppData>;
    return {
      syllabi: parsed.syllabi ?? [],
      courses: parsed.courses ?? [],
      lessons: parsed.lessons ?? [],
      attempts: parsed.attempts ?? [],
      layout: { ...DEFAULT_LAYOUT, ...(parsed.layout ?? {}) }
    };
  } catch {
    return DEFAULT_DATA;
  }
}

export function writeAppData(data: AppData): AppData {
  const file = dataFile();
  ensureDir(file);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  return data;
}

export function readApiKey(provider: AiProvider): string | null {
  const file = keyFile(provider);
  if (!fs.existsSync(file) || !safeStorage.isEncryptionAvailable()) {
    return null;
  }

  try {
    const encrypted = fs.readFileSync(file);
    return safeStorage.decryptString(encrypted);
  } catch {
    return null;
  }
}

export function saveApiKey(provider: AiProvider, key: string): KeyStatus {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('当前系统不支持安全加密存储，无法保存 API Key。');
  }

  const file = keyFile(provider);
  ensureDir(file);
  fs.writeFileSync(file, safeStorage.encryptString(key.trim()));
  return getKeyStatus(provider);
}

export function clearApiKey(provider: AiProvider): KeyStatus {
  const file = keyFile(provider);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
  return getKeyStatus(provider);
}

export function getKeyStatus(provider: AiProvider): KeyStatus {
  return {
    configured: Boolean(readApiKey(provider)),
    secureStorageAvailable: safeStorage.isEncryptionAvailable()
  };
}
