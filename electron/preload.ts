import { contextBridge, ipcRenderer } from 'electron';
import type { AiProvider, AiRequest, AiStreamChunk, AppData, KeyStatus } from './types';

const termLearn = {
  getData: (): Promise<AppData> => ipcRenderer.invoke('data:get'),
  saveData: (data: AppData): Promise<AppData> => ipcRenderer.invoke('data:save', data),
  getKeyStatus: (provider: AiProvider): Promise<KeyStatus> => ipcRenderer.invoke('key:status', provider),
  saveApiKey: (provider: AiProvider, key: string): Promise<KeyStatus> => ipcRenderer.invoke('key:save', provider, key),
  clearApiKey: (provider: AiProvider): Promise<KeyStatus> => ipcRenderer.invoke('key:clear', provider),
  listModels: (provider: AiProvider) => ipcRenderer.invoke('models:list', provider),
  aiRequest: (request: AiRequest) => ipcRenderer.invoke('ai:request', request),
  aiRequestStream: async (request: AiRequest, onChunk: (chunk: AiStreamChunk) => void) => {
    const streamId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    const channel = `ai:stream:chunk:${streamId}`;
    const listener = (_event: Electron.IpcRendererEvent, chunk: AiStreamChunk) => onChunk(chunk);
    ipcRenderer.on(channel, listener);
    try {
      return await ipcRenderer.invoke('ai:stream', streamId, request);
    } finally {
      ipcRenderer.off(channel, listener);
    }
  }
};

contextBridge.exposeInMainWorld('termLearn', termLearn);
