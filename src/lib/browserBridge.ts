import { defaultData } from './data';
import type { AiProvider, AiRequest, AppData, KeyStatus } from '../types';

export function installBrowserBridge() {
  if (window.termLearn) {
    return;
  }

  let data: AppData = defaultData;
  let keyStatus: Record<AiProvider, KeyStatus> = {
    deepseek: {
      configured: false,
      secureStorageAvailable: false
    },
    glm: {
      configured: false,
      secureStorageAvailable: false
    }
  };

  const requestAi = async (request: AiRequest) => {
    if (!keyStatus[request.provider].configured) {
      const label = request.provider === 'glm' ? 'GLM' : 'DeepSeek';
      return {
        ok: false,
        error: request.payload.language === 'en'
          ? `${label} API Key is missing. Save it in the AI panel.`
          : `${label} API Key 未配置。请在右侧 AI 面板保存 Key。`
      };
    }

    return {
      ok: false,
      error: request.payload.language === 'en'
        ? `Browser preview does not call AI directly: ${request.task}. Use the Electron app.`
        : `浏览器预览模式不会直连 AI：${request.task} 请在 Electron 桌面端使用。`
    };
  };

  window.termLearn = {
    async getData() {
      return data;
    },
    async saveData(nextData: AppData) {
      data = nextData;
      return data;
    },
    async getKeyStatus(provider: AiProvider) {
      return keyStatus[provider];
    },
    async saveApiKey(provider: AiProvider) {
      keyStatus[provider] = {
        configured: true,
        secureStorageAvailable: false
      };
      return keyStatus[provider];
    },
    async clearApiKey(provider: AiProvider) {
      keyStatus[provider] = {
        configured: false,
        secureStorageAvailable: false
      };
      return keyStatus[provider];
    },
    async listModels(provider: AiProvider) {
      const model = provider === 'glm' ? 'glm-4.5v' : 'deepseek-chat';
      return {
        ok: keyStatus[provider].configured,
        models: [
          {
            id: model,
            label: model,
            vision: provider === 'glm'
          }
        ],
        error: keyStatus[provider].configured ? undefined : 'API Key missing.'
      };
    },
    async aiRequest(request: AiRequest) {
      return requestAi(request);
    },
    async aiRequestStream(request: AiRequest) {
      return requestAi(request);
    }
  };
}
