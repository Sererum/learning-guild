import {historicalRepairLessons} from './historical-repairs.mjs';

// Reuse the reviewed string demonstration. The daily task, tests and ID stay unchanged.
const source = historicalRepairLessons.find(lesson => lesson.id === 'repair-clean');
const section = source.sections[0];
export const dailyLesson = {
  id: 'daily',
  type: 'daily',
  title: 'Ежедневное повторение · Чистое имя',
  subtitle: 'Знакомые строки · около 5 минут',
  description: 'Короткое повторение методов строк: убрать пробелы по краям, сделать буквы маленькими и сохранить результат.',
  minutes: 5,
  reward: 60,
  qualityCap: 0,
  taskIds: ['daily'],
  sections: [{...section, id: 'daily-string-theory', title: 'Теория · Пробелы и регистр', paragraphs: section.paragraphs.slice(0, 2), taskIds: ['daily'], example: {...section.example}}],
  cheatsheet: source.cheatsheet,
  pitfalls: source.pitfalls.slice(0, 2),
  resources: []
};
