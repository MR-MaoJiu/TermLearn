import type { AppData, CourseProfile, GeneratedLesson, QuizAttempt, SyllabusSource } from '../types';
import { getMessages, type Language } from './i18n';

export const defaultData: AppData = {
  syllabi: [],
  courses: [],
  lessons: [],
  attempts: [],
  layout: {
    focusMode: false,
    showCoursePanel: true,
    showAiPanel: true,
    showStatusBar: true,
    language: 'zh',
    aiStreaming: true,
    aiProvider: 'glm',
    aiModel: 'glm-4.5v'
  }
};

export function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function titleFromText(rawText: string, language: Language) {
  const firstLine = rawText
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine?.replace(/^#+\s*/, '').slice(0, 28) || getMessages(language).unnamedCourse;
}

export function asCourseProfile(json: unknown, syllabus: SyllabusSource, language: Language): CourseProfile {
  const value = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  const createdAt = nowIso();
  const text = getMessages(language);

  return {
    id: uid('course'),
    syllabusId: syllabus.id,
    title: stringValue(value.title, syllabus.title),
    courseType: stringValue(value.courseType, text.uncategorizedCourse),
    examGoals: stringArray(value.examGoals),
    knowledgeTree: treeValue(value.knowledgeTree, language),
    questionTypes: stringArray(value.questionTypes),
    capabilityRequirements: stringArray(value.capabilityRequirements),
    createdAt,
    updatedAt: createdAt
  };
}

export function asGeneratedLesson(json: unknown, courseId: string, language: Language): GeneratedLesson {
  const value = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  const text = getMessages(language);

  return {
    id: uid('lesson'),
    courseId,
    title: stringValue(value.title, text.aiLesson),
    objective: stringValue(value.objective, text.defaultObjective),
    explanation: stringValue(value.explanation, ''),
    examples: stringArray(value.examples),
    exercises: exerciseArray(value.exercises, language),
    createdAt: nowIso()
  };
}

export function asQuiz(json: unknown, language: Language) {
  const value = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  const text = getMessages(language);
  return {
    question: stringValue(value.question, text.emptyQuestion),
    expectedAnswer: stringValue(value.expectedAnswer, ''),
    rubric: stringValue(value.rubric, text.defaultRubric)
  };
}

export function asAttempt(json: unknown, courseId: string, question: string, userAnswer: string): QuizAttempt {
  const value = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  const score = numberValue(value.score, 0);
  const maxScore = numberValue(value.maxScore, 100);

  return {
    id: uid('attempt'),
    courseId,
    question,
    userAnswer,
    score,
    maxScore,
    deductions: stringArray(value.deductions),
    referenceAnswer: stringValue(value.referenceAnswer, ''),
    explanation: stringValue(value.explanation, ''),
    createdAt: nowIso()
  };
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function treeValue(value: unknown, language: Language): CourseProfile['knowledgeTree'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const node = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    return {
      title: stringValue(node.title, getMessages(language).unnamedKnowledge),
      children: stringArray(node.children)
    };
  });
}

function exerciseArray(value: unknown, language: Language): GeneratedLesson['exercises'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const exercise = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    return {
      prompt: stringValue(exercise.prompt, getMessages(language).unnamedExercise),
      referenceAnswer: stringValue(exercise.referenceAnswer, ''),
      rubric: stringValue(exercise.rubric, '')
    };
  });
}
