import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {findPython312, validateProfileId} from '../local-config.mjs';
import {getExecutionCapabilities} from '../execution-sandbox.mjs';
import {findCodexExecutable} from '../codex-reviewer.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deploymentFile = path.join(root, 'local-data', 'deployment.json');
const processFile = path.join(root, 'local-data', 'deployment-process.json');
const help = `Learning Guild — одно приложение для всех локальных курсов
  node tools/deploy.mjs doctor [--python PATH] [--codex PATH]
  node tools/deploy.mjs setup [--port 4327] [--python PATH] [--codex PATH]
  node tools/deploy.mjs start
  node tools/deploy.mjs status
  node tools/deploy.mjs smoke
  node tools/deploy.mjs autostart --dry-run
  node tools/deploy.mjs autostart
  node tools/deploy.mjs stop
  node tools/deploy.mjs uninstall-autostart
Установка пакетов, авторизация и обход защиты автоматически не выполняются.`;

export function parseOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') { options.dryRun = true; continue; }
    const key = {'--port': 'port', '--python': 'python', '--codex': 'codex', '--profile': 'profileId', '--state-file': 'stateFile'}[args[i]];
    if (!key || Object.hasOwn(options, key) || !args[i + 1] || args[i + 1].startsWith('--')) throw Error('Неизвестный, повторный или незаполненный параметр. Используй --help.');
    options[key] = args[++i];
  }
  return options;
}

function checkedJson(file, maximum = 1024 * 1024) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximum) throw Error('Метаданные профиля должны быть обычным JSON-файлом допустимого размера.');
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw Error('Не удалось прочитать JSON профиля. Исходные файлы не изменены.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Метаданные профиля должны содержать JSON-объект.');
  return value;
}

function existingBinding(stateFile) {
  const directory = path.dirname(stateFile);
  if (fs.existsSync(directory) && (!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink())) throw Error('Выбери обычную папку профиля, без символьной ссылки.');
  const file = path.join(directory, 'profile.json');
  if (!fs.existsSync(file)) return null;
  const binding = checkedJson(file);
  if (binding.version !== 1) throw Error('Неизвестный формат привязки профиля.');
  validateProfileId(binding.courseId);
  validateProfileId(binding.profileId);
  return binding;
}

export function validateDeploymentBinding(config) {
  const binding = existingBinding(config.stateFile);
  if (binding && (binding.courseId !== config.courseId || binding.profileId !== config.profileId)) throw Error('ID профиля не совпадает с импортированным сохранением. Сохрани исходный ID; не создавай новую привязку поверх профиля.');
  if (fs.existsSync(config.stateFile)) {
    if (!binding) throw Error('У существующего сохранения нет profile.json. Импортируй полный профиль, а не один progress.json.');
    const state = checkedJson(config.stateFile, 32 * 1024 * 1024);
    if (state.version !== 1) throw Error('Неизвестная версия сохранения профиля.');
  }
  const courseState = path.join(path.dirname(config.stateFile), 'course-state.json');
  if (fs.existsSync(courseState)) {
    const personal = checkedJson(courseState, 4 * 1024 * 1024);
    if (!binding || personal.schemaVersion !== 1 || personal.courseId !== config.courseId || personal.profileId !== config.profileId) throw Error('course-state.json принадлежит другому профилю или курсу.');
  }
  return config;
}

export function deploymentSelection(options = {}, {appRoot = root} = {}) {
  if (options.profileId !== undefined || options.stateFile !== undefined) {
    throw Error('Запуск теперь общий для всех курсов. Сначала перенеси старый курс и полный профиль через tools/migrate-local-courses.mjs; затем используй setup без --profile и --state-file. Старые файлы не изменены.');
  }
  return {mode:'accounts', applicationRoot:path.resolve(appRoot)};
}

export function validateDeployment(config) {
  if (config.version === 1) throw Error('Это настройка прежнего сервера одного профиля. Останови его прежней версией deploy.mjs, сохрани резервную копию, перенеси курс и убери старый LaunchAgent. Затем архивируй deployment.json и выполни setup заново. Автоматическая перезапись не выполняется.');
  if (config.version !== 2 || config.mode !== 'accounts') throw Error('Неизвестный формат настройки развёртывания.');
  if (['courseId','profileId','stateFile'].some(key => Object.hasOwn(config,key))) throw Error('Общий запуск не может содержать выбор одного профиля. Выполни setup заново.');
  if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535) throw Error('Порт: целое число от 1024 до 65535.');
  for (const key of ['node', 'python', 'codex', 'applicationRoot']) if (!path.isAbsolute(config[key] || '')) throw Error(`В настройке ${key} нужен полный путь этого компьютера.`);
  return config;
}

export function assertNoLegacyAutostarts({home=os.homedir()}={}) {
  const folder=path.join(home,'Library','LaunchAgents');
  if (!fs.existsSync(folder)) return;
  const old=fs.readdirSync(folder).filter(name=>/^local\.learning-guild\..+\.plist$/.test(name));
  if (old.length) throw Error('Найден прежний автозапуск одного профиля: '+old.join(', ')+'. Сначала останови и отключи его штатной командой старой установки. Новый запуск не включён.');
}

export async function assertPortFree(port) {
  await new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once('error', error => reject(Error(error.code === 'EADDRINUSE'
      ? `Порт ${port} занят. Не останавливай чужой процесс: выбери другой --port.` : error.message)));
    socket.listen(port, '127.0.0.1', () => socket.close(resolve));
  });
}

function runtimeInfo(executable) {
  const result = spawnSync(executable, ['-I', '-c', 'import json,sys; print(json.dumps({"executable":sys.executable,"version":list(sys.version_info[:2])}))'], {encoding: 'utf8', timeout: 5000});
  if (result.error || result.status !== 0) throw Error('Не удалось запустить готовый Python 3.12. Укажи --python PATH.');
  const info = JSON.parse(result.stdout);
  if (info.version.join('.') !== '3.12') throw Error('Нужен Python строго версии 3.12.');
  return fs.realpathSync(info.executable);
}

export function checkRuntime(options = {}) {
  if (Number(process.versions.node.split('.')[0]) < 20) throw Error('Нужен готовый Node.js версии 20 или новее.');
  const python = runtimeInfo(findPython312(options.python));
  const capabilities = getExecutionCapabilities({python, refresh: true});
  if (!capabilities.available || !capabilities.filesystemIsolation || !capabilities.networkDenied || !capabilities.childProcessesDenied) {
    throw Error(`Защищённое выполнение Python не прошло проверку: ${capabilities.reason}\nСервер не запущен. В этой версии поддерживается macOS с рабочим Seatbelt. На Windows/Linux нужен отдельный проверенный исполнитель; доверенный режим не включай.`);
  }
  const candidate = options.codex || findCodexExecutable();
  if (!candidate || !fs.existsSync(candidate)) throw Error('Локальный Codex CLI не найден. Укажи --codex PATH. Ничего не установлено.');
  const codex = fs.realpathSync(candidate);
  const status = spawnSync(codex, ['login', 'status'], {encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024});
  // Authentication output may contain account details; do not copy it to logs.
  if (status.error || status.status !== 0) throw Error('Codex не авторизован или не отвечает. Агент должен проверить вход штатным способом; токены в архив не копировать.');
  return {node: fs.realpathSync(process.execPath), python, codex, backend: capabilities.backend};
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2) + '\n', {mode: 0o600});
  fs.renameSync(file + '.tmp', file);
}

function readConfig() {
  if (!fs.existsSync(deploymentFile)) throw Error('Сначала выполни setup на этом компьютере.');
  const config=validateDeployment(JSON.parse(fs.readFileSync(deploymentFile, 'utf8')));
  if (path.resolve(config.applicationRoot)!==root) throw Error('Настройка создана для другой папки приложения. Сохрани её резервную копию и выполни setup в новой папке; запуск старой копии отменён.');
  return config;
}

const xml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function autostartPlan(config, {home = os.homedir(), appRoot = root, platform = process.platform} = {}) {
  validateDeployment(config);
  if (platform !== 'darwin') throw Error('Автозапуск этой защищённой сборки поддерживается только в macOS.');
  const label = 'local.learning-guild';
  // launchd opens these paths before Node starts. Documents may be unavailable
  // to launchd even when Node can read the app through its absolute paths.
  const logs = path.join(home, 'Library', 'Logs', 'LearningGuild');
  const env = {PATH: config.path || '/usr/bin:/bin:/usr/sbin:/sbin', GUILD_CODEX_BIN: config.codex, GUILD_PYTHON: config.python};
  if (config.dyldLibraryPath) env.DYLD_LIBRARY_PATH = config.dyldLibraryPath;
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${xml(label)}</string>
<key>ProgramArguments</key><array><string>${xml(config.node)}</string><string>${xml(path.join(appRoot, 'tools', 'deploy.mjs'))}</string><string>start</string></array>
<key>WorkingDirectory</key><string>${xml(home)}</string>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
<key>ThrottleInterval</key><integer>30</integer>
<key>ProcessType</key><string>Background</string>
<key>EnvironmentVariables</key><dict>${Object.entries(env).map(([key, value]) => `<key>${xml(key)}</key><string>${xml(value)}</string>`).join('')}</dict>
<key>StandardOutPath</key><string>${xml(path.join(logs, 'server.log'))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(logs, 'error.log'))}</string>
</dict></plist>\n`;
  return {label, file: path.join(home, 'Library', 'LaunchAgents', label + '.plist'), content, logs};
}

function managedProcess() {
  if (!fs.existsSync(processFile)) return null;
  const current = JSON.parse(fs.readFileSync(processFile, 'utf8'));
  if (!Number.isInteger(current.pid) || !/^[a-f0-9]{32}$/.test(current.nonce || '')) throw Error('Некорректная запись управляемого процесса. Проверь её вручную.');
  try { process.kill(current.pid, 0); return current; } catch (error) { if (error.code !== 'ESRCH') throw error; return null; }
}

export async function waitForDeployment(config, {timeoutMs = 15000, readProcess = managedProcess, fetchImpl = fetch} = {}) {
  const deadline = Date.now() + timeoutMs;
  do {
    const current = readProcess();
    if (current?.mode === 'accounts' && current.port === config.port) {
      try {
        const response = await fetchImpl(`http://127.0.0.1:${config.port}/api/accounts`, {signal: AbortSignal.timeout(1000)});
        if (response.ok && Array.isArray((await response.json()).accounts) && readProcess()?.nonce === current.nonce) return;
      } catch { /* The process may still be starting. */ }
    }
    if (Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, Math.min(250, deadline - Date.now())));
  } while (Date.now() <= deadline);
  throw Error('Служба зарегистрирована, но сервер не подтвердил запуск. Проверь журналы и ограничения macOS; защита не отключена.');
}

async function start(config) {
  if (managedProcess()) throw Error('Этот экземпляр уже запущен. Открой status или останови его через stop.');
  assertNoLegacyAutostarts();
  const runtime = checkRuntime(config);
  await assertPortFree(config.port);
  process.env.GUILD_CODEX_BIN = runtime.codex;
  process.env.GUILD_PYTHON = runtime.python;
  const {createAccountServer} = await import('../account-server.mjs');
  const server = createAccountServer({root:config.applicationRoot, python:runtime.python, reviewExecutable:runtime.codex, learningExecutable:runtime.codex});
  const nonce = crypto.randomBytes(16).toString('hex');
  const stopFile = path.join(root, 'local-data', `stop-${nonce}`);
  let timer;
  const cleanup = () => {
    clearInterval(timer);
    try { if (JSON.parse(fs.readFileSync(processFile, 'utf8')).nonce === nonce) fs.unlinkSync(processFile); } catch {}
    fs.rmSync(stopFile, {force: true});
  };
  const stop = () => { clearInterval(timer); server.close(); server.closeIdleConnections?.(); };
  server.once('close', cleanup);
  server.once('error', error => { cleanup(); console.error(error.message); process.exitCode = 1; });
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  server.listen(config.port, '127.0.0.1', () => {
    writeJson(processFile, {pid: process.pid, nonce, port: config.port, mode:'accounts'});
    timer = setInterval(() => { if (fs.existsSync(stopFile)) stop(); }, 500);
    console.log(`Learning Guild: http://127.0.0.1:${config.port}/#world\nВсе локальные курсы; Python: защищённый по умолчанию.\nОстановка: node tools/deploy.mjs stop`);
  });
}

function launchctl(args, {allowMissing = false} = {}) {
  const result = spawnSync('/bin/launchctl', args, {encoding: 'utf8', timeout: 15000});
  if (result.error || (!allowMissing && result.status !== 0)) throw Error('launchctl не выполнил действие. Проверь собственный LaunchAgent и журнал; не используй sudo или обход системных ограничений.');
}

export async function smokeDeployment(config) {
  if (config.dyldLibraryPath) process.env.DYLD_LIBRARY_PATH = config.dyldLibraryPath;
  const runtime = checkRuntime(config);
  const {runPython} = await import('../server.mjs');
  const {createAccountServer} = await import('../account-server.mjs');
  const task = {tests: [{label: 'Smoke', inputs: {values: [2, 3]}, expected: {total: 5}}]};
  const result = await runPython(task, 'total = sum(values)\nprint(total)', runtime.python);
  if (!result.ok) throw Error('Защищённый smoke-тест Python не пройден: ' + (result.error || 'проверка не прошла'));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'guild-deploy-smoke-'));
  let server;
  try {
    server = createAccountServer({root:directory, python:runtime.python, importHistory:false, reviewProvider:'off', learningProvider:'off', sharedReviewProvider:'off'});
    server.guildStore.create({id:'smoke',title:'Проверка установки',learnerName:'Тестовый профиль',goal:'Проверить локальную установку.',contentMode:'blank',preferencesMode:'new'});
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/state?account=smoke`);
    if (!response.ok || !(await response.json()).state) throw Error('Не удалось получить состояние временного сервера.');
    console.log('Smoke пройден: защищённый Python, тесты и HTTP. Использован временный профиль, реальный прогресс не изменён.');
  } finally {
    if (server?.listening) await new Promise(resolve => { server.close(resolve); server.closeIdleConnections?.(); });
    fs.rmSync(directory, {recursive: true, force: true});
  }
}

async function stop() {
  if (process.platform === 'darwin' && fs.existsSync(deploymentFile)) {
    const plan = autostartPlan(readConfig());
    launchctl(['bootout', `gui/${process.getuid()}/${plan.label}`], {allowMissing: true});
  }
  const current = managedProcess();
  if (!current) { console.log('Управляемый сервер уже остановлен.'); return; }
  // A nonce file is consumed by our own wrapper; never kill an arbitrary PID.
  fs.writeFileSync(path.join(root, 'local-data', `stop-${current.nonce}`), '', {mode: 0o600});
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 250));
    if (!managedProcess()) { console.log('Сервер остановлен. Сохранения остаются на месте.'); return; }
  }
  throw Error('Сервер ещё завершает работу. Проверь status и логи; не удаляй блокировку профиля работающего процесса.');
}

export async function main(args = process.argv.slice(2)) {
  const [command = '--help', ...rest] = args;
  const options = parseOptions(rest);
  if (['--help', 'help'].includes(command)) { console.log(help); return; }
  const allowed = {doctor: ['python', 'codex'], setup: ['profileId', 'stateFile', 'port', 'python', 'codex', 'dryRun'], autostart: ['dryRun'], 'uninstall-autostart': ['dryRun'], start: [], stop: [], status: [], smoke: []}[command];
  if (allowed && Object.keys(options).some(key => !allowed.includes(key))) throw Error('Параметры не поддерживаются этой командой. Курсы переключаются в приложении.');
  if (command === 'doctor') {
    const runtime = checkRuntime(options);
    console.log(`Проверки пройдены: Node ${process.versions.node}; Python 3.12; ${runtime.backend}; Codex авторизован.\nНичего не установлено и не запущено.`);
  } else if (command === 'setup') {
    const selection = deploymentSelection(options);
    if (fs.existsSync(deploymentFile)) throw Error('Настройка уже существует. Сначала останови действующий сервер и сохрани её резервную копию. Автоматическая перезапись не выполняется.');
    assertNoLegacyAutostarts();
    const runtime = checkRuntime(options);
    const config = validateDeployment({version: 2, ...runtime, ...selection, port: Number(options.port || 4327), path: process.env.PATH || '/usr/bin:/bin', ...(process.env.DYLD_LIBRARY_PATH ? {dyldLibraryPath: process.env.DYLD_LIBRARY_PATH} : {})});
    await assertPortFree(config.port);
    if (fs.existsSync(deploymentFile)) throw Error('Настройка уже существует. Не перезаписываю её: сначала останови сервер и проверь local-data/deployment.json.');
    if (!options.dryRun) writeJson(deploymentFile, config);
    console.log(`${options.dryRun ? 'Проверено без записи' : 'Настройка сохранена'}: http://127.0.0.1:${config.port}/#world\nКурсы: ${path.join(config.applicationRoot, 'local-courses')}\nЗатем: node tools/deploy.mjs start`);
  } else if (command === 'start') {
    const config = readConfig();
    if (config.dyldLibraryPath) process.env.DYLD_LIBRARY_PATH = config.dyldLibraryPath;
    await start(config);
  } else if (command === 'status') {
    const current = managedProcess();
    console.log(current ? `Сервер запущен: http://127.0.0.1:${current.port}/#world` : 'Управляемый сервер остановлен.');
  } else if (command === 'smoke') {
    await smokeDeployment(readConfig());
  } else if (command === 'autostart') {
    const config = readConfig();
    const plan = autostartPlan(config);
    if (options.dryRun) { console.log(JSON.stringify(plan, null, 2)); return; }
    checkRuntime(config);
    assertNoLegacyAutostarts();
    if (managedProcess()) throw Error('Сначала останови ручной запуск через stop; затем включи автозапуск.');
    await assertPortFree(config.port);
    if (fs.existsSync(plan.file)) throw Error('LaunchAgent уже существует. Для изменения сначала используй uninstall-autostart.');
    fs.mkdirSync(path.dirname(plan.file), {recursive: true});
    fs.mkdirSync(plan.logs, {recursive: true});
    fs.writeFileSync(plan.file, plan.content, {flag: 'wx', mode: 0o600});
    try {
      launchctl(['bootstrap', `gui/${process.getuid()}`, plan.file]);
      await waitForDeployment(config);
    } catch (error) {
      launchctl(['bootout', `gui/${process.getuid()}/${plan.label}`], {allowMissing: true});
      fs.unlinkSync(plan.file);
      throw Error(error.message + '\nАвтозапуск отменён. Логи: ' + plan.logs);
    }
    console.log(`Автозапуск после входа включён. http://127.0.0.1:${config.port}/#world\nЛоги: ${plan.logs}\nПроверь: node tools/deploy.mjs status`);
  } else if (command === 'stop') {
    await stop();
  } else if (command === 'uninstall-autostart') {
    const plan = autostartPlan(readConfig());
    if (options.dryRun) { console.log(`Будет остановлен управляемый сервер и удалён только ${plan.file}. Сохранения сохраняются.`); return; }
    await stop();
    fs.rmSync(plan.file, {force: true});
    console.log('Автозапуск удалён. Приложение и личные сохранения сохранены.');
  } else throw Error('Неизвестная команда. Используй --help.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
