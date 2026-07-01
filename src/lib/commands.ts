import type { AiRequest, AiResponse, AppData, ImageAttachment, RuntimeState, TerminalLine } from '../types';
import { modelSupportsImages } from './aiProviders';
import { asAttempt, asCourseProfile, asGeneratedLesson, asQuiz, nowIso, titleFromText, uid } from './data';
import { formatAttempt, formatCourse, formatLesson } from './format';
import { getMessages } from './i18n';

export interface CommandContext {
  data: AppData;
  runtime: RuntimeState;
  prompt: string;
  attachments: ImageAttachment[];
  clearAttachments: () => void;
  append: (kind: TerminalLine['kind'], text: string) => string;
  updateLine: (id: string, text: string) => void;
  setData: (data: AppData) => Promise<void>;
  setRuntime: (runtime: RuntimeState) => void;
  openImportDialog: () => void;
}

export async function runCommand(input: string, context: CommandContext) {
  const command = input.trim();
  const text = getMessages(context.data.layout.language);
  if (!command) {
    if (context.runtime.explainMode && context.attachments.length > 0) {
      context.append('command', `${context.prompt} ${text.imageOnlyQuestion}`);
      await explainFollowup(text.imageOnlyQuestion, context);
    }
    return;
  }

  context.append('command', `${context.prompt} ${command}`);
  const [root, sub, ...rest] = command.split(/\s+/);
  const args = [sub, ...rest].filter((item): item is string => Boolean(item));

  if (root === 'help') {
    context.append(
      'info',
      [
        text.availableCommands,
        ...text.commandHelp.map(([commandName, description]) => `  ${commandName.padEnd(28)} ${description}`)
      ].join('\n')
    );
    return;
  }

  if (root === 'syllabus' && sub === 'import') {
    context.openImportDialog();
    context.append('info', text.importOpened);
    return;
  }

  if (root === 'syllabus' && sub === 'list') {
    if (!context.data.syllabi.length) {
      context.append('warning', text.emptySyllabusList);
      return;
    }

    context.append(
      'output',
      context.data.syllabi
        .map((item, index) => {
          const course = context.data.courses.find((candidate) => candidate.syllabusId === item.id);
          return `${index + 1}. ${item.title}  id=${item.id}  status=${item.parseStatus}${course ? `  course=${course.id}` : ''}`;
        })
        .join('\n')
    );
    return;
  }

  if (root === 'course' && sub === 'list') {
    listCourses(context);
    return;
  }

  if (root === 'course' && (sub === 'enter' || sub === 'use')) {
    enterCourse(rest[0], context);
    return;
  }

  if (root === 'course' && sub === 'create') {
    await createCourseFromName(rest.join(' '), context);
    return;
  }

  if (root === 'lesson' && sub === 'start') {
    await generateLesson(rest[0], context);
    return;
  }

  if (root === 'quiz' && sub === 'start') {
    const { courseId, userQuizRequest } = parseQuizArgs(rest, context);
    await generateQuiz(courseId, userQuizRequest, context);
    return;
  }

  if (root === 'exam' && sub === 'generate') {
    const course = findCourse(rest[0], context);
    if (!course) {
      context.append('error', text.courseNotFound);
      return;
    }
    context.append('info', text.examHint(course.title, course.id));
    return;
  }

  if (root === 'answer') {
    await gradeAnswer(args.join(' '), context);
    return;
  }

  if (context.runtime.explainMode && (root === 'exit' || root === 'quit')) {
    exitExplainMode(context);
    return;
  }

  if (root === 'explain') {
    if (sub === 'exit' || sub === 'quit') {
      exitExplainMode(context);
      return;
    }
    await explainLast(context);
    return;
  }

  if (root === 'layout') {
    await updateLayout(sub, context);
    return;
  }

  if (root === 'settings' && sub === 'key' && rest[0] === 'set') {
    context.append('info', text.saveKeyHint);
    return;
  }

  if (context.runtime.activeQuestion) {
    await gradeAnswer(command, context);
    return;
  }

  if (context.runtime.explainMode) {
    await explainFollowup(command, context);
    return;
  }

  context.append('error', text.unknownCommand(command));
}

function listCourses(context: CommandContext) {
  const text = getMessages(context.data.layout.language);
  if (!context.data.courses.length) {
    context.append('warning', text.emptyCourseList);
    return;
  }

  context.append(
    'output',
    context.data.courses
      .map((course, index) => {
        const activeMark = course.id === context.runtime.activeCourseId ? '*' : ' ';
        return `${activeMark} ${index + 1}. ${course.title}  id=${course.id}  type=${course.courseType}`;
      })
      .join('\n')
  );
}

function enterCourse(courseId: string | undefined, context: CommandContext) {
  const text = getMessages(context.data.layout.language);
  if (!courseId) {
    context.append('error', text.missingCourseId);
    return;
  }

  const course = context.data.courses.find((item) => item.id === courseId);
  if (!course) {
    context.append('error', text.courseNotFound);
    return;
  }

  context.setRuntime({
    ...context.runtime,
    activeCourseId: course.id
  });
  context.append('success', text.courseEntered(course.title));
  context.append('info', text.activeCourseCommands);
}

export async function importSyllabus(rawText: string, context: CommandContext) {
  const syllabus = await createCourseSource(rawText, context);
  if (!syllabus) {
    return;
  }

  const text = getMessages(context.data.layout.language);
  context.append('success', text.syllabusImported(syllabus.title));
  await generateCourse(syllabus.id, {
    ...context,
    data: {
      ...context.data,
      syllabi: [syllabus, ...context.data.syllabi]
    }
  });
}

async function createCourseFromName(name: string, context: CommandContext) {
  const text = getMessages(context.data.layout.language);
  const syllabus = await createCourseSource(name, context);
  if (!syllabus) {
    return;
  }

  context.append('success', text.syllabusImported(syllabus.title));
  await generateCourse(syllabus.id, {
    ...context,
    data: {
      ...context.data,
      syllabi: [syllabus, ...context.data.syllabi]
    }
  });
}

async function createCourseSource(rawText: string, context: CommandContext) {
  const text = getMessages(context.data.layout.language);
  const trimmed = rawText.trim();
  if (!trimmed) {
    context.append('error', text.emptySyllabus);
    return null;
  }

  const time = nowIso();
  const syllabus = {
    id: uid('syllabus'),
    title: titleFromText(trimmed, context.data.layout.language),
    rawText: trimmed,
    importMethod: 'paste' as const,
    parseStatus: 'pending' as const,
    createdAt: time,
    updatedAt: time
  };

  await context.setData({
    ...context.data,
    syllabi: [syllabus, ...context.data.syllabi]
  });

  return syllabus;
}

async function generateCourse(syllabusId: string | undefined, context: CommandContext) {
  const text = getMessages(context.data.layout.language);
  const syllabus = findSyllabusSource(syllabusId, context);
  if (!syllabus) {
    context.append('error', syllabusId ? text.syllabusNotFound(syllabusId) : text.missingSyllabusId);
    return;
  }

  const response = await requestAi(
    {
      task: 'parseSyllabus',
      payload: {
        language: context.data.layout.language,
        syllabus: syllabus.rawText
      }
    },
    text.parsingSyllabus,
    context,
    'json'
  );

  if (!response.ok || !response.json) {
    context.append('error', response.error || text.invalidCourseJson);
    return;
  }

  const course = asCourseProfile(response.json, syllabus, context.data.layout.language);
  const updatedSyllabi = context.data.syllabi.map((item) =>
    item.id === syllabus.id
      ? { ...item, title: course.title, parseStatus: 'parsed' as const, updatedAt: nowIso() }
      : item
  );
  const updatedData = {
    ...context.data,
    syllabi: updatedSyllabi,
    courses: [course, ...context.data.courses.filter((item) => item.syllabusId !== syllabus.id)]
  };

  await context.setData(updatedData);
  context.setRuntime({ ...context.runtime, activeCourseId: course.id });
  context.append('success', text.courseGenerated);
  context.append('output', formatCourse(course, context.data.layout.language));
}

async function generateLesson(courseId: string | undefined, context: CommandContext) {
  const text = getMessages(context.data.layout.language);
  const course = findCourse(courseId, context);
  if (!course) {
    context.append('error', text.courseNotFound);
    return;
  }

  const response = await requestAi(
    {
      task: 'generateLesson',
      payload: {
        language: context.data.layout.language,
        course,
        syllabus: context.data.syllabi.find((item) => item.id === course.syllabusId)?.rawText
      }
    },
    text.generatingLesson(course.title),
    context,
    'json'
  );

  if (!response.ok || !response.json) {
    context.append('error', response.error || text.invalidLesson);
    return;
  }

  const lesson = asGeneratedLesson(response.json, course.id, context.data.layout.language);
  await context.setData({
    ...context.data,
    lessons: [lesson, ...context.data.lessons]
  });
  context.setRuntime({ ...context.runtime, activeCourseId: course.id });
  context.append('success', text.lessonGenerated(lesson.title));
  context.append('output', formatLesson(lesson, context.data.layout.language));
}

async function generateQuiz(courseId: string | undefined, userQuizRequest: string, context: CommandContext) {
  const text = getMessages(context.data.layout.language);
  const course = findCourse(courseId, context);
  if (!course) {
    context.append('error', text.courseNotFound);
    return;
  }

  const pendingQuizText = text.generatingQuiz(course.title);
  let avoidQuestions = [
    ...(context.runtime.recentQuizQuestions ?? []),
    ...context.data.attempts
      .filter((attempt) => attempt.courseId === course.id)
      .map((attempt) => attempt.question)
  ].slice(0, 12);
  let avoidSignatures = [
    ...(context.runtime.recentQuizSignatures ?? []),
    ...context.data.attempts
      .filter((attempt) => attempt.courseId === course.id)
      .map((attempt) => quizTemplateSignature(attempt.question))
  ].slice(0, 12);
  let response = null as Awaited<ReturnType<typeof window.termLearn.aiRequest>> | null;
  let quiz = null as ReturnType<typeof asQuiz> | null;
  let duplicateTemplate = false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await requestAi(
      {
        task: 'generateQuiz',
        payload: {
          language: context.data.layout.language,
          course,
          syllabus: context.data.syllabi.find((item) => item.id === course.syllabusId)?.rawText,
          recentAttempts: context.data.attempts.filter((item) => item.courseId === course.id).slice(0, 5),
          avoidQuestions,
          avoidQuestionTemplates: avoidSignatures,
          userQuizRequest,
          variationAttempt: attempt + 1,
          randomSeed: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          variationInstruction: attempt === 0
            ? '生成一道新题。不要复用 avoidQuestions 中的题干或 avoidQuestionTemplates 中的题型模板；如果 userQuizRequest 不为空，必须优先满足用户指定的题型、范围、难度、形式或约束。'
            : '上一题型模板与历史题过于相似。必须更换知识点、题型、材料背景、能力层级或作答形式，例如概念辨析、实践操作、设计题、案例分析、填空、简答、计算步骤题等。'
        }
      },
      attempt === 0 ? pendingQuizText : `${pendingQuizText} retry ${attempt + 1}/3`,
      context,
      'json'
    );

    if (!response.ok || !response.json) {
      break;
    }

    quiz = asQuiz(response.json, context.data.layout.language);
    const signature = quizTemplateSignature(quiz.question);
    duplicateTemplate = avoidSignatures.includes(signature);
    if (!duplicateTemplate) {
      break;
    }

    avoidQuestions = [quiz.question, ...avoidQuestions].slice(0, 12);
    avoidSignatures = [signature, ...avoidSignatures].slice(0, 12);
  }

  if (!response?.ok || !response.json || !quiz) {
    context.append('error', invalidAiJsonMessage(text.invalidQuiz, response));
    return;
  }

  if (duplicateTemplate) {
    context.setRuntime({
      ...context.runtime,
      activeCourseId: course.id,
      explainMode: undefined,
      recentQuizQuestions: [quiz.question, ...(context.runtime.recentQuizQuestions ?? [])].slice(0, 12),
      recentQuizSignatures: [quizTemplateSignature(quiz.question), ...(context.runtime.recentQuizSignatures ?? [])].slice(0, 12)
    });
    context.append('warning', text.duplicateQuiz);
    return;
  }

  const quizSignature = quizTemplateSignature(quiz.question);
  context.setRuntime({
    ...context.runtime,
    activeCourseId: course.id,
    explainMode: undefined,
    recentQuizQuestions: [quiz.question, ...(context.runtime.recentQuizQuestions ?? [])].slice(0, 12),
    recentQuizSignatures: [quizSignature, ...(context.runtime.recentQuizSignatures ?? [])].slice(0, 12),
    activeQuestion: {
      courseId: course.id,
      ...quiz
    }
  });
  context.append('success', text.quizGenerated);
  context.append('output', `${quiz.question}\n\n${text.answerInstruction}`);
}

async function gradeAnswer(answer: string, context: CommandContext) {
  const text = getMessages(context.data.layout.language);
  if (!answer.trim()) {
    context.append('error', text.emptyAnswer);
    return;
  }

  if (!context.runtime.activeQuestion) {
    context.append('error', text.noActiveQuestion);
    return;
  }

  if (!ensureImageCapable(context)) {
    context.append('error', text.imageProviderUnsupported);
    return;
  }

  const response = await requestAi(
    {
      task: 'gradeAnswer',
      payload: {
        language: context.data.layout.language,
        question: context.runtime.activeQuestion.question,
        expectedAnswer: context.runtime.activeQuestion.expectedAnswer,
        rubric: context.runtime.activeQuestion.rubric,
        userAnswer: answer,
        images: context.attachments
      }
    },
    text.grading,
    context,
    'json'
  );

  if (!response.ok || !response.json) {
    context.append('error', response.error || text.invalidGrade);
    return;
  }

  const attempt = asAttempt(response.json, context.runtime.activeQuestion.courseId, context.runtime.activeQuestion.question, answer);
  await context.setData({
    ...context.data,
    attempts: [attempt, ...context.data.attempts]
  });
  context.clearAttachments();
  context.setRuntime({
    ...context.runtime,
    activeQuestion: undefined,
    lastAttemptId: attempt.id,
    explainMode: undefined
  });
  context.append('success', text.gradeDone);
  context.append('output', formatAttempt(attempt, context.data.layout.language));
}

async function explainLast(context: CommandContext) {
  const text = getMessages(context.data.layout.language);
  const lastAttempt = context.runtime.lastAttemptId
    ? context.data.attempts.find((item) => item.id === context.runtime.lastAttemptId)
    : context.data.attempts[0];

  if (!lastAttempt) {
    context.append('warning', text.noExplainAttempt);
    return;
  }

  if (!ensureImageCapable(context)) {
    context.append('error', text.imageProviderUnsupported);
    return;
  }

  const response = await requestAi(
    {
      task: 'explainMistake',
      payload: {
        language: context.data.layout.language,
        attempt: lastAttempt,
        images: context.attachments
      }
    },
    text.explaining,
    context,
    'text'
  );

  if (!response.ok) {
    context.append('error', response.error || text.explainFailed);
    return;
  }

  if (!context.data.layout.aiStreaming) {
    context.append('ai', response.content || lastAttempt.explanation);
  }
  context.clearAttachments();
  context.setRuntime({
    ...context.runtime,
    activeCourseId: lastAttempt.courseId,
    explainMode: {
      attemptId: lastAttempt.id
    }
  });
  context.append('info', text.explainModeEntered);
}

async function explainFollowup(question: string, context: CommandContext) {
  const text = getMessages(context.data.layout.language);
  const attempt = context.data.attempts.find((item) => item.id === context.runtime.explainMode?.attemptId);
  if (!attempt) {
    context.append('warning', text.noExplainAttempt);
    context.setRuntime({
      ...context.runtime,
      explainMode: undefined
    });
    return;
  }

  if (!ensureImageCapable(context)) {
    context.append('error', text.imageProviderUnsupported);
    return;
  }

  const response = await requestAi(
    {
      task: 'explainFollowup',
      payload: {
        language: context.data.layout.language,
        attempt,
        question,
        images: context.attachments
      }
    },
    text.explainFollowupThinking,
    context,
    'text'
  );

  if (!response.ok) {
    context.append('error', response.error || text.explainFailed);
    return;
  }

  if (!context.data.layout.aiStreaming) {
    context.append('ai', response.content || text.explainFailed);
  }
  context.clearAttachments();
}

function ensureImageCapable(context: CommandContext) {
  return context.attachments.length === 0
    || modelSupportsImages(context.data.layout.aiProvider, context.data.layout.aiModel);
}

function exitExplainMode(context: CommandContext) {
  const text = getMessages(context.data.layout.language);
  if (!context.runtime.explainMode) {
    context.append('warning', text.noExplainMode);
    return;
  }

  context.setRuntime({
    ...context.runtime,
    explainMode: undefined
  });
  context.append('success', text.explainModeExited);
}

async function requestAi(
  request: Omit<AiRequest, 'provider'>,
  pendingText: string,
  context: CommandContext,
  mode: 'text' | 'json'
): Promise<AiResponse> {
  const providerRequest = {
    ...request,
    provider: context.data.layout.aiProvider,
    model: context.data.layout.aiModel
  };
  if (!context.data.layout.aiStreaming) {
    context.append('ai', pendingText);
    return window.termLearn.aiRequest(providerRequest);
  }

  const lineId = context.append('ai', pendingText);
  let streamed = '';
  let lastRenderAt = 0;
  const response = await window.termLearn.aiRequestStream(providerRequest, (chunk) => {
    streamed += chunk.content;
    const now = Date.now();
    if (now - lastRenderAt > 80) {
      context.updateLine(lineId, streamRenderText(mode, pendingText, streamed));
      lastRenderAt = now;
    }
  });

  if (!response.ok) {
    context.updateLine(lineId, response.error || pendingText);
  } else if (streamed) {
    context.updateLine(lineId, streamRenderText(mode, pendingText, streamed, true));
  } else if (!streamed && response.content) {
    context.updateLine(lineId, streamRenderText(mode, pendingText, response.content, true));
  }

  if (mode === 'json' && !response.json && response.content) {
    return {
      ...response,
      json: parseJsonFromText(response.content)
    };
  }

  return response;
}

function streamRenderText(mode: 'text' | 'json', pendingText: string, content: string, done = false) {
  if (mode === 'text') {
    return content || pendingText;
  }

  const size = content.length;
  return done ? `${pendingText}\n[stream] complete, ${size} chars received.` : `${pendingText}\n[stream] ${size} chars received...`;
}

function parseJsonFromText(content: string) {
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

function parseJsonCandidate(content: string) {
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

function invalidAiJsonMessage(fallback: string, response: AiResponse | null) {
  if (response?.error) {
    return response.error;
  }

  const preview = response?.content?.trim().slice(0, 800);
  return preview ? `${fallback}\n[debug] AI 原始返回预览：\n${preview}` : fallback;
}

async function updateLayout(mode: string | undefined, context: CommandContext) {
  const text = getMessages(context.data.layout.language);
  if (mode === 'focus') {
    await context.setData({
      ...context.data,
      layout: {
        focusMode: true,
        aiStreaming: context.data.layout.aiStreaming,
        aiProvider: context.data.layout.aiProvider,
        aiModel: context.data.layout.aiModel,
        showCoursePanel: false,
        showAiPanel: false,
        showStatusBar: false,
        language: context.data.layout.language
      }
    });
    context.append('success', text.focusDone);
    return;
  }

  if (mode === 'restore') {
    await context.setData({
      ...context.data,
      layout: {
        focusMode: false,
        aiStreaming: context.data.layout.aiStreaming,
        aiProvider: context.data.layout.aiProvider,
        aiModel: context.data.layout.aiModel,
        showCoursePanel: true,
        showAiPanel: true,
        showStatusBar: true,
        language: context.data.layout.language
      }
    });
    context.append('success', text.restoreDone);
    return;
  }

  context.append('error', text.unknownLayout);
}

function findCourse(courseId: string | undefined, context: CommandContext) {
  if (courseId) {
    return context.data.courses.find((item) => item.id === courseId);
  }

  if (context.runtime.activeCourseId) {
    const activeCourse = context.data.courses.find((item) => item.id === context.runtime.activeCourseId);
    if (activeCourse) {
      return activeCourse;
    }
  }

  return context.data.courses[0];
}

function findSyllabusSource(sourceId: string | undefined, context: CommandContext) {
  if (sourceId) {
    const directSource = context.data.syllabi.find((item) => item.id === sourceId);
    if (directSource) {
      return directSource;
    }

    const course = context.data.courses.find((item) => item.id === sourceId);
    if (course) {
      return context.data.syllabi.find((item) => item.id === course.syllabusId);
    }

    return undefined;
  }

  const generatedSourceIds = new Set(context.data.courses.map((course) => course.syllabusId));
  return context.data.syllabi.find((item) => item.parseStatus !== 'parsed' || !generatedSourceIds.has(item.id))
    ?? context.data.syllabi[0];
}

function parseQuizArgs(args: string[], context: CommandContext) {
  const first = args[0];
  if (!first) {
    return {
      courseId: undefined,
      userQuizRequest: ''
    };
  }

  const isKnownCourseId = context.data.courses.some((course) => course.id === first);
  if (isKnownCourseId) {
    return {
      courseId: first,
      userQuizRequest: args.slice(1).join(' ').trim()
    };
  }

  if (first.startsWith('course_')) {
    return {
      courseId: first,
      userQuizRequest: args.slice(1).join(' ').trim()
    };
  }

  return {
    courseId: undefined,
    userQuizRequest: args.join(' ').trim()
  };
}

function quizTemplateSignature(question: string) {
  return question
    .toLowerCase()
    .replace(/r\s*[（(][^）)]*[）)]/gi, 'r(...)')
    .replace(/f\s*=\s*[{｛][^}｝]*[}｝]/gi, 'f={...}')
    .replace(/[a-z]\s*(?:→|->)\s*[a-z]+/gi, 'x->y')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, '')
    .replace(/[，。,.；;：:]/g, '')
    .slice(0, 240);
}
