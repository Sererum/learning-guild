import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {profileAssetUrls,readProfileAsset,withProfileAssets,maximumProfileAssetBytes} from '../shared/profile-assets.mjs';
import {avatar} from '../public/pages/hero.js';
import {createGuildServer} from '../server.mjs';
import {createEngine} from '../shared/engine-core.mjs';
import course from '../courses/alice-python/index.mjs';
import {findPython312} from '../local-config.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
const legacy = ['alice-scholar-v1.png','alice-appearance-v1.png','alice-wardrobe-v2.png'];
const engine = createEngine(course);
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guild-profile-assets-'));
  const profile = path.join(root, 'selected');
  fs.mkdirSync(path.join(profile, 'assets'), {recursive: true});
  const stateFile = path.join(profile, 'progress.json');
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  return {root, profile, stateFile, assets: path.join(profile, 'assets')};
}

test('profile map contains only bounded PNG URLs and rejects traversal, symlinks and invalid images', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.assets, 'portrait.png'), png);
  fs.writeFileSync(path.join(f.root, 'outside.png'), png);
  fs.symlinkSync(path.join(f.root, 'outside.png'), path.join(f.assets, 'linked.png'));
  fs.linkSync(path.join(f.root, 'outside.png'), path.join(f.assets, 'hardlinked.png'));
  fs.writeFileSync(path.join(f.assets, 'not-image.png'), '<svg onload="bad()"></svg>');
  fs.writeFileSync(path.join(f.assets, 'active.svg'), '<svg/>');
  fs.writeFileSync(path.join(f.assets, 'huge.png'), png);
  fs.truncateSync(path.join(f.assets, 'huge.png'), maximumProfileAssetBytes + 1);
  const dimensions = Buffer.from(png);dimensions.writeUInt32BE(100000, 16);
  fs.writeFileSync(path.join(f.assets, 'pixel-bomb.png'), dimensions);
  assert.deepEqual(profileAssetUrls(f.stateFile), {'portrait.png': '/assets/portrait.png'});
  assert.deepEqual(readProfileAsset(f.stateFile, 'portrait.png'), png);
  for (const name of ['../outside.png', '/outside.png', '..%2foutside.png', 'linked.png', 'hardlinked.png', 'not-image.png', 'active.svg', 'huge.png', 'pixel-bomb.png', 'portrait.png/../outside.png', 'portrait.png?other']) assert.equal(readProfileAsset(f.stateFile, name), null, name);
  fs.rmSync(f.assets, {recursive: true});
  fs.symlinkSync(f.root, f.assets);
  assert.deepEqual(profileAssetUrls(f.stateFile), {});
  assert.equal(readProfileAsset(f.stateFile, 'outside.png'), null);
});

test('fresh avatar uses a neutral existing symbol and ignores legacy custom appearance choices', () => {
  const state = engine.initialState(), before = structuredClone(state);
  const plain = avatar(state, engine.catalog);
  assert.match(plain, /hero-neutral-portrait/);
  assert.match(plain, /href="\/assets\/nav-hero\.svg"/);
  assert.doesNotMatch(plain, /href="[^\"]*alice-(?:scholar|appearance|wardrobe)/);
  assert.deepEqual(state, before);
  for (const portraitAsset of ['/assets/alice-scholar-v1.png', '/assets/other.png', '/assets/nav-hero.svg', '/assets/../outside.png', 'https://remote.test/photo.png']) assert.match(avatar({...state, portraitAsset}, engine.catalog), /hero-neutral-portrait/);
  const custom = avatar({...state, portraitAsset: '/assets/portrait.png', profileAssets: {'portrait.png': '/assets/portrait.png'}}, engine.catalog);
  assert.doesNotMatch(custom, /href="\/assets\/portrait\.png"/);
  assert.match(custom, /hero-neutral-portrait/);
  assert.match(avatar({...state, profileAssets: {'portrait.png': 'file:///outside.png'}, portraitAsset: '/assets/portrait.png'}, engine.catalog), /hero-neutral-portrait/);
});

test('derived URL view strips forged saved mappings without mutating the original progress', t => {
  const f = fixture(t), state = engine.initialState();
  assert.equal(withProfileAssets(state, f.stateFile), state);
  state.profileAssets = {'fake.png': '/assets/fake.png'};
  const before = structuredClone(state), view = withProfileAssets(state, f.stateFile);
  assert.equal(view.profileAssets, undefined);
  assert.deepEqual(state, before);
  fs.writeFileSync(path.join(f.assets, 'portrait.png'), png);
  assert.deepEqual(withProfileAssets(state, f.stateFile).profileAssets, {'portrait.png': '/assets/portrait.png'});
  assert.deepEqual(state, before);
});

test('private wardrobe preserves legacy files while showing the fixed appearance', () => {
  const state = engine.initialState(), profileAssets = Object.fromEntries(legacy.map(name => [name, '/assets/' + name]));
  assert.match(avatar({...state, profileAssets}, engine.catalog), /href="\/assets\/alice-wardrobe-v2\.png"/);
  assert.match(avatar({...state, hair: 'dark', profileAssets}, engine.catalog), /href="\/assets\/alice-wardrobe-v2\.png"/);
  assert.match(avatar({...state, portraitAsset: '/assets/alice-scholar-v1.png', profileAssets}, engine.catalog), /href="\/assets\/alice-wardrobe-v2\.png"/);
  assert.match(avatar({...state, portraitAsset: '/assets/missing.png', profileAssets}, engine.catalog), /href="\/assets\/alice-wardrobe-v2\.png"/);
});

test('API isolates private bytes per profile, derives URLs without persisting them, and never serves a legacy public portrait fallback', async t => {
  const f = fixture(t), python = findPython312(process.env.GUILD_PYTHON);
  const servers = [];
  t.after(async () => {for (const server of servers) await new Promise(resolve => {server.close(resolve);server.closeIdleConnections?.();});});
  const start = async (name, bytes) => {
    const folder = path.join(f.root, name);fs.mkdirSync(path.join(folder, 'assets'), {recursive: true});
    const stateFile = path.join(folder, 'progress.json'), content = JSON.stringify(engine.initialState());
    fs.writeFileSync(stateFile, content);
    if (bytes) fs.writeFileSync(path.join(folder, 'assets', legacy[0]), bytes);
    const server = createGuildServer({course, stateFile, profileId: name, python, importHistory: false, reviewProvider: 'off', learningProvider: 'off', sharedReviewProvider: 'off'});
    servers.push(server);await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return {origin: 'http://127.0.0.1:' + server.address().port, stateFile, content, folder};
  };
  const bytesA = Buffer.concat([png, Buffer.from('profile-a')]), bytesB = Buffer.concat([png, Buffer.from('profile-b')]);
  const a = await start('profile-a', bytesA), b = await start('profile-b', bytesB), fresh = await start('profile-fresh');
  for (const [profile, expected] of [[a, bytesA], [b, bytesB]]) {
    const response = await fetch(profile.origin + '/assets/' + legacy[0]);
    assert.equal(response.status, 200);assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
    const data = await (await fetch(profile.origin + '/api/state')).json();
    assert.deepEqual(data.state.profileAssets, {[legacy[0]]: '/assets/' + legacy[0]});
    assert.ok(!JSON.stringify(data.state.profileAssets).includes(f.root));
    assert.equal(fs.readFileSync(profile.stateFile, 'utf8'), profile.content);
  }
  const data = await (await fetch(fresh.origin + '/api/state')).json();
  assert.equal(data.state.profileAssets, undefined);
  assert.match(avatar(data.state, data.catalog), /hero-neutral-portrait/);
  for (const name of legacy) assert.equal((await fetch(fresh.origin + '/assets/' + name)).status, 404, name);
  assert.equal((await fetch(fresh.origin + '/assets/nav-hero.svg')).status, 200);
  assert.equal(fs.readFileSync(fresh.stateFile, 'utf8'), fresh.content);
  fs.symlinkSync(path.join(a.folder, 'assets', legacy[0]), path.join(fresh.folder, 'assets', legacy[0]));
  assert.equal((await fetch(fresh.origin + '/assets/' + legacy[0])).status, 404);
  assert.equal((await (await fetch(fresh.origin + '/api/state')).json()).state.profileAssets, undefined);
  for (const address of ['/assets/../progress.json', '/assets/%2e%2e/progress.json', '/assets/%2e%2e%2fprogress.json', '/assets/profile-a%2falice-scholar-v1.png']) assert.equal((await fetch(fresh.origin + address)).status, 404, address);
});
