import type { CourseProfile, GeneratedLesson, QuizAttempt } from '../types';
import { getMessages, type Language } from './i18n';

export function formatCourse(course: CourseProfile, language: Language) {
  const text = getMessages(language);
  const goals = course.examGoals.length ? course.examGoals.join(' / ') : text.unidentifiedGoals;
  const types = course.questionTypes.length ? course.questionTypes.join(' / ') : text.unidentifiedTypes;
  return [
    `${text.courseLabel}: ${course.title}`,
    `${text.typeLabel}: ${course.courseType}`,
    `${text.examGoalsLabel}: ${goals}`,
    `${text.questionTypesLabel}: ${types}`,
    `${text.knowledgeCountLabel}: ${course.knowledgeTree.length}`
  ].join('\n');
}

export function formatLesson(lesson: GeneratedLesson, language: Language) {
  const text = getMessages(language);
  const examples = lesson.examples.map((item, index) => `  ${index + 1}. ${item}`).join('\n');
  const exercises = lesson.exercises.map((item, index) => `  ${index + 1}. ${item.prompt}`).join('\n');
  return [
    `${text.lessonTitleLabel}: ${lesson.title}`,
    `${text.objectiveLabel}: ${lesson.objective}`,
    '',
    lesson.explanation,
    examples ? `\n${text.examplesLabel}:\n${examples}` : '',
    exercises ? `\n${text.exercisesLabel}:\n${exercises}` : ''
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatAttempt(attempt: QuizAttempt, language: Language) {
  const text = getMessages(language);
  const deductions = attempt.deductions.length ? attempt.deductions.join('；') : text.noDeductions;
  return [
    `${text.scoreLabel}: ${attempt.score}/${attempt.maxScore}`,
    `${text.deductionsLabel}: ${deductions}`,
    `${text.referenceAnswerLabel}: ${attempt.referenceAnswer}`,
    `${text.aiExplanationLabel}: ${attempt.explanation}`
  ].join('\n');
}
