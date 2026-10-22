import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const applicationRoot = path.dirname(fileURLToPath(import.meta.url));
const safeId = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export function validateProfileId(id) {
  if (typeof id !== 'string' || !safeId.test(id)) throw Error('Имя профиля: латинские буквы, цифры, _ или -, до 64 символов.');
  return id;
}

// Machine-specific paths and account choices never belong in Git.
export function readLocalConfig({root = applicationRoot, env = process.env, args = []} = {}) {
  const file = path.join(root, 'local.config.json');
  const local = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const cli = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = {'--course': 'courseId', '--course-dir': 'courseDir', '--profile': 'profileId', '--port': 'port'}[args[i]];
    if (!key || !args[i + 1] || args[i + 1].startsWith('--')) throw Error('Доступны --course ID, --course-dir PATH, --profile ID и --port NUMBER.');
    cli[key] = args[i + 1];
  }
  let lastCourse;try{lastCourse=JSON.parse(fs.readFileSync(path.join(root,'local-data','selected-course.json'),'utf8')).id;}catch{}
  const courseId = cli.courseId || env.GUILD_COURSE || lastCourse || local.courseId || 'new-course';
  if (!safeId.test(courseId)) throw Error('Некорректный ID курса.');
  const profileId = validateProfileId(cli.profileId || env.GUILD_PROFILE || local.profileId || 'default');
  const changedSelection = courseId !== (local.courseId || 'new-course') || profileId !== (local.profileId || 'default') || !!cli.courseDir || !!env.GUILD_COURSE_DIR;
  const stateFile = env.GUILD_STATE_FILE || (!changedSelection && local.stateFile) || path.join('profiles', courseId, profileId, 'progress.json');
  const port = Number(cli.port || env.GUILD_PORT || local.port || 4327);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Порт должен быть числом от 1 до 65535.');
  const courseDir = cli.courseDir || env.GUILD_COURSE_DIR || (!cli.courseId && !env.GUILD_COURSE && local.courseDir);
  const accountManifest=path.join(root,'local-courses',courseId,'manifest.json');
  if(!cli.courseDir&&!env.GUILD_COURSE_DIR&&fs.existsSync(accountManifest)){const m=JSON.parse(fs.readFileSync(accountManifest,'utf8'));return {courseId,profileId:m.profileId,explicitStateFile:true,courseDir:path.dirname(accountManifest),stateFile:path.join(path.dirname(accountManifest),'profile','progress.json'),port,python:env.GUILD_PYTHON||local.python};}
  return {courseId, profileId, explicitStateFile:!!(env.GUILD_STATE_FILE||(!changedSelection&&local.stateFile)),courseDir: courseDir ? path.resolve(root, courseDir) : undefined,
    stateFile: path.resolve(root, stateFile), port, python: env.GUILD_PYTHON || local.python,
    learnerName: local.learnerName};
}

export function profileStateFile(courseId, profileId = 'default', root = applicationRoot) {
  if (!safeId.test(courseId)) throw Error('Некорректный ID курса.');
  return path.join(root, 'profiles', courseId, validateProfileId(profileId), 'progress.json');
}

export function resolveCourseSettings(settings,course) {
  return {...settings,courseId:course.id,stateFile:settings.explicitStateFile?settings.stateFile:profileStateFile(course.id,settings.profileId)};
}

// One writer per profile prevents an old in-memory state from overwriting a session.
export function acquireProfileLock(stateFile) {
  const file=path.join(path.dirname(stateFile),'.guild-lock.json');
  const id=String(process.pid)+'-'+Math.random().toString(36).slice(2);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  for(let attempt=0;attempt<2;attempt++) {
    try {
      fs.writeFileSync(file,JSON.stringify({pid:process.pid,id}),{flag:'wx',mode:0o600});
      return ()=>{try {const current=JSON.parse(fs.readFileSync(file,'utf8'));if(current.id===id)fs.unlinkSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}};
    } catch(error) {
      if(error.code!=='EEXIST')throw error;
      let old;try {old=JSON.parse(fs.readFileSync(file,'utf8'));}catch {throw Error('Не удалось проверить блокировку профиля. Закрой другое приложение и проверь .guild-lock.json в папке сохранений.');}
      if(!Number.isInteger(old.pid)||old.pid<=0)throw Error('Некорректная блокировка профиля. Проверь .guild-lock.json в папке сохранений.');
      let alive=true;try{process.kill(old.pid,0);}catch(error){if(error.code==='ESRCH')alive=false;}
      if(alive)throw Error('Этот профиль уже открыт в другом экземпляре приложения. Закрой его или выбери другой профиль.');
      fs.unlinkSync(file);
    }
  }
  throw Error('Не удалось заблокировать профиль. Повтори запуск.');
}

// Keep progress.json unchanged: binding belongs beside it, not in its schema.
export function bindProfile(stateFile, courseId, profileId = 'default') {
  validateProfileId(courseId); validateProfileId(profileId);
  const file = path.join(path.dirname(stateFile), 'profile.json');
  const expected = {version: 1, courseId, profileId};
  if (fs.existsSync(file)) {
    const current = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (current.courseId !== courseId || current.profileId !== profileId) throw Error('Эта папка сохранений уже принадлежит другому курсу или профилю. Выбери отдельный профиль.');
  } else {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, JSON.stringify(expected, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  }
  return expected;
}

export function findPython312(explicit) {
  const candidates = explicit ? [explicit] : [path.join(os.homedir(), '.local', 'bin', 'python3.12'), path.join(os.homedir(), '.venv', 'bin', 'python'), 'python3.12', 'python'];
  for (const executable of candidates) {
    const result = spawnSync(executable, ['-I', '-c', 'import sys; print("%d.%d" % sys.version_info[:2])'], {encoding: 'utf8', timeout: 5000});
    if (!result.error && result.status === 0 && result.stdout.trim() === '3.12') return executable;
  }
  throw Error('Нужен готовый Python 3.12. Укажи путь в local.config.json (python) или GUILD_PYTHON. Приложение ничего не устанавливает.');
}
