import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const copy = value => value === undefined ? undefined : structuredClone(value);
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, stable(value[key])])) : value;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24);
const pick = (value, fields) => Object.fromEntries(fields.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
const cosmeticFields = new Set(['reward', 'minutes', 'qualityCap', 'x', 'y', 'color', 'icon', 'className', 'style']);
const semantic = value => Object.fromEntries(Object.entries(value).filter(([key]) => !cosmeticFields.has(key)));
// Executed examples carry derived presentation data. Adding a verified trace
// must not invalidate a learner's viewed theory or the lesson's existing work.
const withoutDerivedTraces = value => Array.isArray(value) ? value.map(withoutDerivedTraces) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'example' && item && typeof item === 'object' ? withoutDerivedTraces(Object.fromEntries(Object.entries(item).filter(([field]) => field !== 'executionTrace'))) : withoutDerivedTraces(item)])) : value;
const taskFields = ['id', 'description', 'statement', 'starter', 'tests', 'constraints', 'answerExamples', 'mode'];
export const taskContentVersion = task => digest({...pick(task, taskFields), ...(task.tests ? {tests: task.tests.map(({label, hidden, ...check}) => check)} : {})});
export const lessonContentVersion = (lesson, tasks = []) => digest({
 ...pick(lesson, ['id', 'description', 'taskIds', 'cheatsheet', 'pitfalls', 'resources']),
 sections: (lesson.sections || []).map(section => withoutDerivedTraces(semantic(section))),
 taskVersions: (lesson.taskIds || []).map(id => [id, taskContentVersion(tasks.find(task => task.id === id) || {id})]),
});
const proofFingerprint = proof => proof ? digest(pick(proof, ['codeHash', 'allPassed'])) : null;

/** Additive local migration. Canonical claims remain the immutable payment ledger. */
export function createContentVersions({directory, readCourse, readState, readChecked = () => null, now = () => new Date().toISOString()}) {
 const file = path.join(directory, 'content-versions.json');
 let registry = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {schemaVersion: 1, tasks: {}, lessons: {}};
 if (registry.schemaVersion !== 1 || !registry.tasks || !registry.lessons) throw Error('Неизвестная версия истории учебных материалов. История сохранена; требуется восстановить совместимую версию приложения.');
 const save = () => {
  fs.mkdirSync(directory, {recursive: true});
  fs.writeFileSync(file + '.tmp', JSON.stringify(registry, null, 2), {mode: 0o600});
  fs.renameSync(file + '.tmp', file);
 };
 function reconcile() {
  const course = readCourse(), state = readState(); let changed = false;
  for (const task of course.tasks || []) {
   const version = taskContentVersion(task), previous = registry.tasks[task.id];
   if (!previous) {
    registry.tasks[task.id] = {version, definition: copy(task), baselineAt: now(), updatedAt: now(), baselineProof: proofFingerprint(state.testProofs?.[task.id]), baselineClaim: !!state.claims?.[task.id], history: []}; changed = true;
   } else if (previous.version !== version) {
    let checked = null; try {checked = readChecked(task.id);} catch {}
    registry.tasks[task.id] = {version, definition: copy(task), baselineAt: previous.baselineAt, updatedAt: now(), baselineProof: null, baselineClaim: false,
     history: [...previous.history, {version: previous.version, definition: previous.definition, archivedAt: now(), proof: copy(state.testProofs?.[task.id]), checked: copy(checked), feedback: copy(state.taskFeedback?.[task.id]), feedbackHistory: copy(state.taskFeedbackHistory?.[task.id]), qualityClaim: copy(state.qualityClaims?.[task.id]), paidClaim: copy(state.claims?.[task.id])}]}; changed = true;
   }
  }
  for (const lesson of course.lessons || []) {
   const version = lessonContentVersion(lesson, course.tasks), previous = registry.lessons[lesson.id];
   if (!previous) {registry.lessons[lesson.id] = {version, updatedAt: now(), history: []}; changed = true;}
   else if (previous.version !== version) {registry.lessons[lesson.id] = {version, updatedAt: now(), history: [...previous.history, {version: previous.version, archivedAt: now()}]}; changed = true;}
  }
  if (changed) save();
  return snapshot();
 }
 function versionForTask(id) {return registry.tasks[id]?.version || null;}
 function isCurrentProof(id, proof) {
  const entry = registry.tasks[id];
  if (!entry || !proof) return false;
  return proof.contentVersion ? proof.contentVersion === entry.version : !entry.history.length && entry.baselineProof === proofFingerprint(proof);
 }
 function stampTask(id, record) {
  const version = versionForTask(id); if (!version) throw Error('Не найдена версия задания');
  return {...record, contentVersion: version};
 }
 function outdated(id, state) {
  const entry = registry.tasks[id];
  // Editing an unattempted exam must not revoke independently imported course
  // history merely because the exam happens to cover the same topics.
  const attempted = state.claims?.[id] || state.testProofs?.[id] || state.taskAttempts?.[id]?.length
   || entry?.history.some(item => item.proof || item.paidClaim || item.checked);
  return !!entry?.history.length && !!attempted && !(isCurrentProof(id, state.testProofs?.[id]) && state.testProofs?.[id]?.allPassed);
 }
 function effectiveState(source = readState()) {
  const state = copy(source), stale = new Set(Object.keys(registry.tasks).filter(id => outdated(id, source)));
  if(stale.size)state.contentNeedsRecheck = [...stale];else delete state.contentNeedsRecheck;
  for (const id of stale) {
   for (const field of ['claims', 'taskReviews', 'revealedTests']) if (state[field]) delete state[field][id];
   if (!isCurrentProof(id,source.testProofs?.[id])&&state.testProofs) delete state.testProofs[id];
   if (!isCurrentProof(id,source.testProofs?.[id])&&state.taskAttempts) delete state.taskAttempts[id];
  }
  for (const [id, entry] of Object.entries(registry.tasks)) if (entry.history.length) {
   if (state.taskFeedback?.[id]) {
    state.taskFeedback[id] = state.taskFeedback[id].filter(feedback => feedback.contentVersion === entry.version);
    if (!state.taskFeedback[id].length) delete state.taskFeedback[id];
   }
  }
  const config = readCourse().engineConfig || {}, affectedPoints = new Set();
  for (const [id, points] of Object.entries(config.taskTopics || {})) if (stale.has(id)) points.forEach(point => affectedPoints.add(point));
  for (const point of config.courseMap?.points || []) if (stale.has(point.task)) affectedPoints.add(point.id);
  for (const group of config.rewardGroups || []) if (group.taskIds.some(id => stale.has(id))) {
   [...(group.completedTopics || []), ...(group.visitedPoints || [])].forEach(id => affectedPoints.add(id));
   // Keep lessonClaims/qualityClaims as payment ledgers; UI receives explicit stale metadata.
  }
  if(affectedPoints.size)state.contentNeedsRecheckPoints=[...affectedPoints];else delete state.contentNeedsRecheckPoints;
  for (const field of ['completedTopics', 'visited', 'statues']) if (Array.isArray(state[field])) state[field] = state[field].filter(id => !affectedPoints.has(id));
  return state;
 }
 function snapshot() {
  const state = readState();
  return {schemaVersion: 1,
   taskVersions: Object.fromEntries(Object.entries(registry.tasks).map(([id, entry]) => [id, entry.version])),
   lessonVersions: Object.fromEntries(Object.entries(registry.lessons).map(([id, entry]) => [id, entry.version])),
   changed: Object.entries(registry.tasks).filter(([, entry]) => entry.history.length).map(([taskId, entry]) => ({taskId, version: entry.version, updatedAt: entry.updatedAt, needsRecheck: outdated(taskId, state), previousVersions: entry.history.length})),
   lessonsChanged: Object.entries(registry.lessons).filter(([, entry]) => entry.history.length).map(([lessonId, entry]) => ({lessonId, version: entry.version, updatedAt: entry.updatedAt, previousVersions: entry.history.length})),
  };
 }
 function archive(taskId) {
  const entry = registry.tasks[taskId]; if (!entry) throw Error('Задание не найдено');
  // No private reference answers are exposed through the archive API.
  return entry.history.map(item => ({version: item.version, archivedAt: item.archivedAt, code: item.checked?.code || null, proof: copy(item.proof), feedback: copy(item.feedback), qualityClaim: copy(item.qualityClaim), paid: !!item.paidClaim}));
 }
 return {reconcile, snapshot, versionForTask, stampTask, isCurrentProof, effectiveState, archive};
}
