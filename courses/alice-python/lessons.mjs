import {repairLessons} from './repair-lessons.mjs';
import {frequencyLesson} from './frequency-lesson.mjs';
import {algorithmWorkbook} from './algorithm-workbook.mjs';
import {foundationsFinalLesson} from './foundations-final.mjs';
import {dailyLesson} from './daily-lesson.mjs';
// Older frequency drafts remain readable; map and book offer complete lessons.
export const lessons=[algorithmWorkbook,foundationsFinalLesson,...repairLessons,frequencyLesson,dailyLesson];
export function lessonForTask(task){return lessons.find(l=>l.id===task||l.taskIds.includes(task));}
