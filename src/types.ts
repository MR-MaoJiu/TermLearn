export type AiProvider = 'deepseek' | 'glm';

export interface ImageAttachment {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
}

export interface SyllabusSource {
  id: string;
  title: string;
  rawText: string;
  importMethod: 'paste' | 'file';
  parseStatus: 'pending' | 'parsed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface CourseProfile {
  id: string;
  syllabusId: string;
  title: string;
  courseType: string;
  examGoals: string[];
  knowledgeTree: Array<{
    title: string;
    children: string[];
  }>;
  questionTypes: string[];
  capabilityRequirements: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedLesson {
  id: string;
  courseId: string;
  title: string;
  objective: string;
  explanation: string;
  examples: string[];
  exercises: Array<{
    prompt: string;
    referenceAnswer: string;
    rubric: string;
  }>;
  createdAt: string;
}

export interface QuizAttempt {
  id: string;
  courseId: string;
  question: string;
  userAnswer: string;
  score: number;
  maxScore: number;
  deductions: string[];
  referenceAnswer: string;
  explanation: string;
  createdAt: string;
}

export interface LayoutState {
  focusMode: boolean;
  showCoursePanel: boolean;
  showAiPanel: boolean;
  showStatusBar: boolean;
  language: 'zh' | 'en';
  aiStreaming: boolean;
  aiProvider: AiProvider;
  aiModel: string;
}

export interface AppData {
  syllabi: SyllabusSource[];
  courses: CourseProfile[];
  lessons: GeneratedLesson[];
  attempts: QuizAttempt[];
  layout: LayoutState;
}

export interface AiRequest {
  task: 'parseSyllabus' | 'generateLesson' | 'generateQuiz' | 'gradeAnswer' | 'explainMistake' | 'explainFollowup';
  provider: AiProvider;
  model?: string;
  payload: Record<string, unknown>;
}

export interface AiResponse {
  ok: boolean;
  content?: string;
  json?: unknown;
  error?: string;
}

export type AiStreamChunk = {
  content: string;
};

export interface KeyStatus {
  configured: boolean;
  secureStorageAvailable: boolean;
}

export interface AiModel {
  id: string;
  label: string;
  vision: boolean;
}

export interface ModelListResponse {
  ok: boolean;
  models: AiModel[];
  error?: string;
}

export interface TerminalLine {
  id: string;
  kind: 'system' | 'command' | 'success' | 'error' | 'info' | 'warning' | 'ai' | 'output';
  text: string;
}

export interface RuntimeState {
  activeCourseId?: string;
  activeQuestion?: {
    courseId: string;
    question: string;
    expectedAnswer: string;
    rubric: string;
  };
  lastAttemptId?: string;
  recentQuizQuestions?: string[];
  recentQuizSignatures?: string[];
  explainMode?: {
    attemptId: string;
  };
}
