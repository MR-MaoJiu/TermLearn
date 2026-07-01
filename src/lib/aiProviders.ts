import type { AiModel, AiProvider } from '../types';

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  glm: 'GLM',
  deepseek: 'DeepSeek'
};

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  glm: 'glm-4.5v',
  deepseek: 'deepseek-chat'
};

export function defaultModelForProvider(provider: AiProvider) {
  return DEFAULT_MODELS[provider];
}

export function modelSupportsImages(provider: AiProvider, model: string) {
  if (provider !== 'glm') {
    return false;
  }

  return /(?:vision|vl|glm-4v|glm-4\.5v|glm-4\.1v|glm-4\.5-v|glm-4\.1-v)/i.test(model);
}

export function fallbackModels(provider: AiProvider): AiModel[] {
  const model = defaultModelForProvider(provider);
  return [
    {
      id: model,
      label: model,
      vision: modelSupportsImages(provider, model)
    }
  ];
}
