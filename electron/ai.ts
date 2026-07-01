import type { AiModel, AiProvider, AiRequest, AiResponse, AiStreamChunk, ModelListResponse } from './types';
import { readApiKey } from './store';

type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

const PROVIDERS: Record<AiProvider, { label: string; url: string; modelsUrl: string; defaultModel: string; vision: boolean }> = {
  deepseek: {
    label: 'DeepSeek',
    url: 'https://api.deepseek.com/chat/completions',
    modelsUrl: 'https://api.deepseek.com/models',
    defaultModel: 'deepseek-chat',
    vision: false
  },
  glm: {
    label: 'GLM',
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    modelsUrl: 'https://open.bigmodel.cn/api/paas/v4/models',
    defaultModel: 'glm-4.5v',
    vision: true
  }
};

export function defaultModelForProvider(provider: AiProvider) {
  return PROVIDERS[provider].defaultModel;
}

function modelSupportsVision(provider: AiProvider, model: string | undefined) {
  if (provider !== 'glm') {
    return false;
  }

  return /(?:vision|vl|glm-4v|glm-4\.5v|glm-4\.1v|glm-4\.5-v|glm-4\.1-v)/i.test(model || PROVIDERS[provider].defaultModel);
}

function fallbackModels(provider: AiProvider): AiModel[] {
  const defaultModel = PROVIDERS[provider].defaultModel;
  return [
    {
      id: defaultModel,
      label: defaultModel,
      vision: modelSupportsVision(provider, defaultModel)
    }
  ];
}

const TASK_SYSTEM_PROMPTS: Record<AiRequest['task'], string> = {
  parseSyllabus: [
    '你是一个严谨的课程结构生成器。',
    '用户可能提供完整课程考纲，也可能只提供课程名称。',
    '如果只有课程名称，请根据该课程的常见学习路径、考试方式和实践要求生成合理课程画像；不要拒绝。',
    '根据用户提供的课程名称或考纲，输出 JSON，不要输出 Markdown。',
    'JSON 结构必须包含 title, courseType, examGoals, knowledgeTree, questionTypes, capabilityRequirements。',
    '必须输出严格 JSON：字符串内换行必须写成 \\n，字符串内部如需英文双引号必须用反斜杠转义。',
    'knowledgeTree 为数组，每项包含 title 和 children 字符串数组。',
    '完整考纲优先服从考纲；只有课程名称时允许基于通用课程体系推断。'
  ].join('\n'),
  generateLesson: [
    '你是终端学习软件的课程生成器。',
    '基于课程画像和可选考纲/课程名称生成一节可学习内容，输出 JSON，不要输出 Markdown。',
    'JSON 结构必须包含 title, objective, explanation, examples, exercises。',
    '必须输出严格 JSON：字符串内换行必须写成 \\n，字符串内部如需英文双引号必须用反斜杠转义。',
    '如果 payload.userLessonRequest 不为空，它代表用户对课程主题、范围、深度、讲解方式、示例类型或练习形式的自然语言要求，必须优先满足。',
    'exercises 每项包含 prompt, referenceAnswer, rubric。'
  ].join('\n'),
  generateQuiz: [
    '你是考试练习出题器。',
    '基于课程画像和可选考纲/课程名称生成一道题，输出 JSON，不要输出 Markdown。',
    'JSON 结构必须包含 question, expectedAnswer, rubric, difficulty, tags。',
    '必须输出严格 JSON：字符串内换行必须写成 \\n，字符串内部如需英文双引号必须用反斜杠转义。',
    '每次出题都必须参考 randomSeed 和 avoidQuestions，避免重复最近已经生成或答过的题目。',
    '如果 payload.userQuizRequest 不为空，它代表用户对题型、范围、难度、形式或约束的自然语言要求，必须优先满足。',
    '必须参考 avoidQuestionTemplates，避免复用相同题型模板；只替换术语、数字、变量名、条件或材料细节不算新题。',
    '如果课程知识点足够，优先更换知识点、题型、数据、案例或问法。',
    '不要连续生成同一种题型模板；应在课程画像允许的范围内轮换知识点、题型、材料背景、能力层级和作答形式。'
  ].join('\n'),
  gradeAnswer: [
    '你是严格但有教学价值的阅卷老师。',
    '根据题目、参考答案、评分标准、用户答案和可选图片附件评分，输出 JSON，不要输出 Markdown。',
    '如果存在图片附件，应把图片内容作为用户答案的一部分进行理解。',
    'JSON 结构必须包含 score, maxScore, deductions, referenceAnswer, explanation。',
    '必须输出严格 JSON：字符串内换行必须写成 \\n，字符串内部如需英文双引号必须用反斜杠转义。'
  ].join('\n'),
  explainMistake: [
    '你是终端风格 AI 讲解助手。',
    '根据最近一次答题记录和可选图片附件讲解错因、材料内容和改进方法。',
    '如果存在图片附件，应把图片内容作为讲解上下文的一部分。',
    '输出简洁中文纯文本，适合显示在终端中。'
  ].join('\n'),
  explainFollowup: [
    '你是终端风格 AI 讲解助手。',
    '用户正在围绕最近一次答题记录追问。',
    '结合题目、用户答案、参考答案、评分讲解、用户追问和可选图片附件继续解释。',
    '如果存在图片附件，应把图片内容作为追问上下文的一部分。',
    '不要输出 Markdown 表格；输出简洁纯文本，适合显示在终端中。'
  ].join('\n')
};

function languageName(request: AiRequest) {
  return request.payload.language === 'en' ? 'English' : 'Chinese';
}

function errorText(request: AiRequest, zh: string, en: string) {
  return request.payload.language === 'en' ? en : zh;
}

function temperatureForTask(task: AiRequest['task']) {
  if (task === 'generateQuiz') {
    return 0.85;
  }
  if (task === 'explainMistake' || task === 'explainFollowup') {
    return 0.35;
  }
  return 0.2;
}

function expectsJson(task: AiRequest['task']) {
  return task === 'parseSyllabus' || task === 'generateLesson' || task === 'generateQuiz' || task === 'gradeAnswer';
}

function tryParseJson(content: string): unknown | undefined {
  const normalized = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const direct = parseJsonCandidate(normalized);
  if (direct !== undefined) {
    return direct;
  }

  {
    const jsonText = extractBalancedJson(normalized);
    if (!jsonText) {
      return undefined;
    }

    return parseJsonCandidate(jsonText);
  }
}

function parseJsonCandidate(content: string): unknown | undefined {
  try {
    return JSON.parse(content);
  } catch {
    try {
      return JSON.parse(repairLooseJsonStrings(content));
    } catch {
      return undefined;
    }
  }
}

function repairLooseJsonStrings(content: string) {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (!inString) {
      result += char;
      if (char === '"') {
        inString = true;
      }
      continue;
    }

    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      escaped = true;
    } else if (char === '"') {
      if (isJsonStringTerminator(content, index)) {
        result += char;
        inString = false;
      } else {
        result += '\\"';
      }
    } else if (char === '\n') {
      result += '\\n';
    } else if (char === '\r') {
      result += '\\r';
    } else if (char === '\t') {
      result += '\\t';
    } else {
      result += char;
    }
  }

  return result;
}

function isJsonStringTerminator(content: string, quoteIndex: number) {
  for (let index = quoteIndex + 1; index < content.length; index += 1) {
    const char = content[index];
    if (char === ' ' || char === '\n' || char === '\r' || char === '\t') {
      continue;
    }

    return char === ':' || char === ',' || char === '}' || char === ']';
  }

  return true;
}

function extractBalancedJson(content: string) {
  const start = content.indexOf('{');
  if (start < 0) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return content.slice(start, index + 1);
      }
    }
  }

  return undefined;
}

function imageUrls(request: AiRequest) {
  const images = request.payload.images;
  if (!Array.isArray(images)) {
    return [];
  }

  return images
    .map((image) => {
      const value = image && typeof image === 'object' ? image as Record<string, unknown> : {};
      return typeof value.dataUrl === 'string' ? value.dataUrl : '';
    })
    .filter(Boolean);
}

function buildMessages(request: AiRequest) {
  const prompt = JSON.stringify({ ...request.payload, images: undefined }, null, 2);
  const images = imageUrls(request);
  const provider = PROVIDERS[request.provider];

  if (images.length && (!provider.vision || !modelSupportsVision(request.provider, request.model))) {
    return null;
  }

  const userContent: string | ChatContentPart[] = images.length
    ? [
        { type: 'text', text: prompt },
        ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } }))
      ]
    : prompt;

  return [
    { role: 'system', content: `${TASK_SYSTEM_PROMPTS[request.task]}\nRespond in ${languageName(request)}.` },
    { role: 'user', content: userContent }
  ];
}

function missingKeyError(request: AiRequest) {
  const provider = PROVIDERS[request.provider];
  return errorText(
    request,
    `${provider.label} API Key 未配置。请在右侧 AI 面板保存 Key。`,
    `${provider.label} API Key is missing. Save it in the AI panel.`
  );
}

function requestBody(request: AiRequest, messages: ReturnType<typeof buildMessages>, stream: boolean, useResponseFormat: boolean) {
  return JSON.stringify({
    model: request.model || PROVIDERS[request.provider].defaultModel,
    temperature: temperatureForTask(request.task),
    ...(useResponseFormat && expectsJson(request.task) ? { response_format: { type: 'json_object' } } : {}),
    ...(stream ? { stream: true } : {}),
    messages
  });
}

export async function callAi(request: AiRequest): Promise<AiResponse> {
  const provider = PROVIDERS[request.provider];
  const key = readApiKey(request.provider);
  if (!key) {
    return { ok: false, error: missingKeyError(request) };
  }

  const messages = buildMessages(request);
  if (!messages) {
    return {
      ok: false,
      error: errorText(request, '当前厂商不支持图片。请切换到 GLM 后再提交图片答案。', 'Current provider does not support images. Switch to GLM before submitting image answers.')
    };
  }

  try {
    let response = await fetch(provider.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: requestBody(request, messages, false, true)
    });

    if (response.status === 400 && expectsJson(request.task)) {
      response = await fetch(provider.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: requestBody(request, messages, false, false)
      });
    }

    if (!response.ok) {
      return {
        ok: false,
        error: errorText(request, `${provider.label} 请求失败：HTTP ${response.status}`, `${provider.label} request failed: HTTP ${response.status}`)
      };
    }

    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return { ok: false, error: errorText(request, `${provider.label} 返回为空。`, `${provider.label} returned an empty response.`) };
    }

    return { ok: true, content, json: tryParseJson(content) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : errorText(request, `${provider.label} 请求异常。`, `${provider.label} request failed.`)
    };
  }
}

export async function streamAi(
  request: AiRequest,
  onChunk: (chunk: AiStreamChunk) => void
): Promise<AiResponse> {
  const provider = PROVIDERS[request.provider];
  const key = readApiKey(request.provider);
  if (!key) {
    return { ok: false, error: missingKeyError(request) };
  }

  const messages = buildMessages(request);
  if (!messages) {
    return {
      ok: false,
      error: errorText(request, '当前厂商不支持图片。请切换到 GLM 后再提交图片答案。', 'Current provider does not support images. Switch to GLM before submitting image answers.')
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    let response = await fetch(provider.url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: requestBody(request, messages, true, true)
    });

    if (response.status === 400 && expectsJson(request.task)) {
      response = await fetch(provider.url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: requestBody(request, messages, true, false)
      });
    }

    if (!response.ok || !response.body) {
      return {
        ok: false,
        error: errorText(request, `${provider.label} 请求失败：HTTP ${response.status}`, `${provider.label} request failed: HTTP ${response.status}`)
      };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let finished = false;

    while (!finished) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) {
          continue;
        }

        const data = trimmed.slice(5).trim();
        if (!data) {
          continue;
        }
        if (data === '[DONE]') {
          finished = true;
          break;
        }

        try {
          const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            content += delta;
            onChunk({ content: delta });
          }
        } catch {
          continue;
        }
      }
    }

    if (finished) {
      await reader.cancel().catch(() => undefined);
    }

    return { ok: true, content, json: tryParseJson(content) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error && error.name === 'AbortError'
        ? errorText(request, `${provider.label} 流式请求超时，请重试或关闭流式输出。`, `${provider.label} streaming timed out. Try again or disable streaming.`)
        : error instanceof Error ? error.message : errorText(request, `${provider.label} 请求异常。`, `${provider.label} request failed.`)
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function listModels(providerName: AiProvider): Promise<ModelListResponse> {
  const provider = PROVIDERS[providerName];
  const key = readApiKey(providerName);
  if (!key) {
    return {
      ok: false,
      models: fallbackModels(providerName),
      error: `${provider.label} API Key 未配置。`
    };
  }

  try {
    const response = await fetch(provider.modelsUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      return {
        ok: false,
        models: fallbackModels(providerName),
        error: `${provider.label} 模型列表请求失败：HTTP ${response.status}`
      };
    }

    const body = await response.json() as { data?: Array<{ id?: string; name?: string }> };
    const models = (body.data ?? [])
      .map((item) => item.id || item.name || '')
      .filter((id): id is string => Boolean(id))
      .map((id) => ({
        id,
        label: id,
        vision: modelSupportsVision(providerName, id)
      }));

    return {
      ok: true,
      models: models.length ? models : fallbackModels(providerName)
    };
  } catch (error) {
    return {
      ok: false,
      models: fallbackModels(providerName),
      error: error instanceof Error ? error.message : `${provider.label} 模型列表请求异常。`
    };
  }
}
