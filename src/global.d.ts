import type { AiProvider, AiRequest, AiResponse, AiStreamChunk, AppData, KeyStatus, ModelListResponse } from './types';

declare global {
  interface Window {
    termLearn: {
      getData: () => Promise<AppData>;
      saveData: (data: AppData) => Promise<AppData>;
      getKeyStatus: (provider: AiProvider) => Promise<KeyStatus>;
      saveApiKey: (provider: AiProvider, key: string) => Promise<KeyStatus>;
      clearApiKey: (provider: AiProvider) => Promise<KeyStatus>;
      listModels: (provider: AiProvider) => Promise<ModelListResponse>;
      aiRequest: (request: AiRequest) => Promise<AiResponse>;
      aiRequestStream: (request: AiRequest, onChunk: (chunk: AiStreamChunk) => void) => Promise<AiResponse>;
    };
  }
}

export {};
