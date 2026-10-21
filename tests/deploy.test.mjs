import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawnSync} from 'node:child_process';
import {autostartPlan, validateDeployment, parseOptions, assertPortFree, deploymentSelection, main} from '../tools/deploy.mjs';

const config = {version: 1, courseId: 'alice-python', profileId: 'default', port: 4327, node: '/test/Node & Apps/node', python: '/test/Python 3.12/python', codex: '/test/Codex/codex', stateFile: '/test/Learning Guild/profiles/alice-python/default/progress.json', path: '/test/bin:/usr/bin:/bin'};

test('deployment validates only machine-local absolute paths and unprivileged ports', () => {
  assert.equal(validateDeployment(config), config);
  for (const port of [0, 80, 65536, 4327.5, '4327']) assert.throws(() => validateDeployment({...config, port}), /Порт/);
  assert.throws(() => validateDeployment({...config, python: 'python'}), /полный путь/);
  assert.throws(() => validateDeployment({...config, profileId: '../shared'}));
  assert.throws(() => validateDeployment({...config, courseId: 'another-course'}));
});

test('deployment options reject unknown flags; paths with spaces remain single arguments', () => {
  assert.deepEqual(parseOptions(['--python', '/Python 3.12/python', '--port', '4901', '--dry-run']), {python: '/Python 3.12/python', port: '4901', dryRun: true});
  assert.throws(() => parseOptions(['--host', '0.0.0.0']));
  assert.throws(() => parseOptions(['--python']));
  assert.throws(() => parseOptions(['--python', '--port']));
  assert.deepEqual(parseOptions(['--profile', 'alice-mvp', '--state-file', '/Private Folder/progress.json']), {profileId: 'alice-mvp', stateFile: '/Private Folder/progress.json'});
  assert.throws(() => parseOptions(['--profile', 'one', '--profile', 'two']), /повторный/);
});

test('deployment preserves imported profile identity and refuses conflicts without changing any profile file', t => {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guild-deploy-profile-'));
  t.after(() => fs.rmSync(appRoot, {recursive: true, force: true}));
  const folder = path.join(appRoot, 'profiles', 'alice-python', 'alice-mvp');
  fs.mkdirSync(folder, {recursive: true});
  const stateFile = path.join(folder, 'progress.json');
  const originals = {
    'progress.json': JSON.stringify({version: 1, currency: 123, unknown: {preserve: true}}),
    'profile.json': JSON.stringify({version: 1, courseId: 'alice-python', profileId: 'alice-mvp'}),
    'course-state.json': JSON.stringify({schemaVersion: 1, courseId: 'alice-python', profileId: 'alice-mvp', history: []})
  };
  for (const [name, text] of Object.entries(originals)) fs.writeFileSync(path.join(folder, name), text);
  const expected = {courseId: 'alice-python', profileId: 'alice-mvp', stateFile};
  assert.deepEqual(deploymentSelection({profileId: 'alice-mvp'}, {appRoot}), expected);
  assert.deepEqual(deploymentSelection({stateFile}, {appRoot}), expected, 'explicit state file infers its existing identity');
  assert.equal(validateDeployment({...config, ...expected}).profileId, 'alice-mvp');
  assert.throws(() => deploymentSelection({profileId: 'default', stateFile}, {appRoot}), /ID профиля/);
  assert.throws(() => deploymentSelection({profileId: '../other'}, {appRoot}));
  assert.throws(() => deploymentSelection({stateFile: path.join(folder, 'missing.json')}, {appRoot}), /не найден/);
  const plan = autostartPlan({...config, ...expected}, {platform: 'darwin', home: appRoot, appRoot});
  assert.equal(plan.label, 'local.learning-guild.alice-mvp');
  for (const [name, text] of Object.entries(originals)) assert.equal(fs.readFileSync(path.join(folder, name), 'utf8'), text, name);
  assert.equal(fs.existsSync(path.join(appRoot, 'local-data')), false);
  assert.equal(fs.existsSync(plan.file), false);
});

test('deployment distinguishes a new profile from incomplete, wrong-course and mismatched imported profiles', t => {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guild-deploy-incomplete-'));
  t.after(() => fs.rmSync(appRoot, {recursive: true, force: true}));
  assert.deepEqual(deploymentSelection({profileId: 'new-profile'}, {appRoot}), {courseId: 'alice-python', profileId: 'new-profile', stateFile: path.join(appRoot, 'profiles', 'alice-python', 'new-profile', 'progress.json')});
  assert.deepEqual(fs.readdirSync(appRoot), [], 'selection does not create a profile');
  const folder = path.join(appRoot, 'imported');fs.mkdirSync(folder);
  const stateFile = path.join(folder, 'progress.json');fs.writeFileSync(stateFile, '{"version":1}');
  assert.throws(() => deploymentSelection({stateFile}, {appRoot}), /нет profile.json/);
  const binding = path.join(folder, 'profile.json');
  fs.writeFileSync(binding, JSON.stringify({version: 1, courseId: 'starter-python', profileId: 'another'}));
  assert.throws(() => deploymentSelection({stateFile}, {appRoot}), /другому курсу/);
  fs.writeFileSync(binding, JSON.stringify({version: 1, courseId: 'alice-python', profileId: 'imported'}));
  fs.writeFileSync(path.join(folder, 'course-state.json'), JSON.stringify({schemaVersion: 1, courseId: 'alice-python', profileId: 'different'}));
  assert.throws(() => deploymentSelection({stateFile}, {appRoot}), /course-state.json/);
  fs.rmSync(path.join(folder, 'course-state.json'));
  fs.rmSync(binding);
  fs.symlinkSync(stateFile, binding);
  assert.throws(() => deploymentSelection({stateFile}, {appRoot}), /обычным JSON/);
});

test('launch commands cannot silently ignore a requested different profile', async () => {
  await assert.rejects(main(['start', '--profile', 'other']), /Параметры не поддерживаются/);
  await assert.rejects(main(['autostart', '--state-file', '/somewhere/progress.json']), /Параметры не поддерживаются/);
});

test('autostart is a pure dry-run plan with correct XML escaping and absolute machine paths', () => {
  const home = path.join(os.tmpdir(), 'guild-plan-' + process.pid);
  const appRoot = '/test/Learning & Guild';
  const plan = autostartPlan(config, {home, appRoot, platform: 'darwin'});
  assert.equal(fs.existsSync(home), false);
  assert.equal(plan.file, path.join(home, 'Library', 'LaunchAgents', 'local.learning-guild.default.plist'));
  assert.match(plan.content, /Node &amp; Apps/);
  assert.match(plan.content, /Learning &amp; Guild/);
  assert.match(plan.content, /<key>RunAtLoad<\/key><true\/>/);
  assert.match(plan.content, /<key>KeepAlive<\/key><false\/>/);
  assert.match(plan.content, /<string>start<\/string>/);
  assert.doesNotMatch(plan.content, /filipov|sudo|trusted-local|0\.0\.0\.0/);
  if (process.platform === 'darwin') {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'guild-plist-test-'));
    try {
      const file = path.join(directory, 'launch.plist');
      fs.writeFileSync(file, plan.content);
      const result = spawnSync('/usr/bin/plutil', ['-lint', file], {encoding: 'utf8'});
      assert.equal(result.status, 0, result.stderr || result.stdout);
    } finally { fs.rmSync(directory, {recursive: true, force: true}); }
  }
});

test('unsupported platform is fail-closed and never produces an autostart plan', () => {
  for (const platform of ['win32', 'linux']) assert.throws(() => autostartPlan(config, {platform}), /только в macOS/);
});

test('occupied loopback port is rejected without touching its existing listener', async () => {
  const server = net.createServer(socket => socket.end('owned test server'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    await assert.rejects(assertPortFree(port), /занят/);
    assert.equal(server.listening, true);
  } finally { await new Promise(resolve => server.close(resolve)); }
  await assertPortFree(port);
});
