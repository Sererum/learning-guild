import fs from 'node:fs';
import path from 'node:path';

// Legacy portrait identifiers remain readable only from the selected private profile.
const privatePortraitNames = new Set(['alice-scholar-v1.png', 'alice-appearance-v1.png', 'alice-wardrobe-v2.png']);
const validName = name => typeof name === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}\.png$/.test(name);
export const maximumProfileAssetBytes = 8 * 1024 * 1024;
export const isPrivatePortraitAsset = name => privatePortraitNames.has(name);
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function openProfileAsset(stateFile, name) {
  if (!validName(name)) return null;
  let descriptor;
  try {
    const profileDirectory = path.dirname(path.resolve(stateFile));
    const profile = fs.lstatSync(profileDirectory);
    if (!profile.isDirectory() || profile.isSymbolicLink()) return null;
    const directory = path.join(profileDirectory, 'assets');
    const folder = fs.lstatSync(directory);
    if (!folder.isDirectory() || folder.isSymbolicLink()) return null;
    const realDirectory = fs.realpathSync(directory);
    if (realDirectory !== path.join(fs.realpathSync(profileDirectory), 'assets')) return null;
    const file = path.join(directory, name);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size < 24 || stat.size > maximumProfileAssetBytes) return null;
    if (fs.realpathSync(file) !== path.join(realDirectory, name)) return null;
    descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
    const opened = fs.fstatSync(descriptor), folderAfter = fs.lstatSync(directory);
    if (!opened.isFile() || opened.ino !== stat.ino || opened.dev !== stat.dev || opened.size !== stat.size || folderAfter.isSymbolicLink() || folderAfter.ino !== folder.ino || fs.realpathSync(file) !== path.join(realDirectory, name)) throw Error('Asset changed during inspection.');
    const header = Buffer.alloc(24);
    if (fs.readSync(descriptor, header, 0, header.length, 0) !== header.length || !header.subarray(0, 8).equals(signature) || header.readUInt32BE(8) !== 13 || header.toString('ascii', 12, 16) !== 'IHDR') throw Error('Not a PNG.');
    const width = header.readUInt32BE(16), height = header.readUInt32BE(20);
    if (!width || !height || width > 4096 || height > 4096 || width * height > 16_000_000) throw Error('Image dimensions exceed the limit.');
    return {descriptor, size: opened.size};
  } catch {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    return null;
  }
}

export function readProfileAsset(stateFile, name) {
  const file = openProfileAsset(stateFile, name);
  if (!file) return null;
  try {
    const result = Buffer.alloc(file.size);
    let offset = 0;
    while (offset < result.length) {
      const read = fs.readSync(file.descriptor, result, offset, result.length - offset, offset);
      if (!read) return null;
      offset += read;
    }
    const current = fs.fstatSync(file.descriptor);
    return current.size === file.size ? result : null;
  } finally { fs.closeSync(file.descriptor); }
}

export function profileAssetUrls(stateFile) {
  const result = {};
  let directory;
  try {
    const profile = path.dirname(path.resolve(stateFile));
    const folder = path.join(profile, 'assets');
    if (fs.lstatSync(profile).isSymbolicLink() || fs.lstatSync(folder).isSymbolicLink() || fs.realpathSync(folder) !== path.join(fs.realpathSync(profile), 'assets')) return result;
    directory = fs.opendirSync(folder);
    let entry, inspected = 0;
    while ((entry = directory.readSync()) && inspected < 256) {
      inspected++;
      if (!entry.isFile() || !validName(entry.name)) continue;
      const file = openProfileAsset(stateFile, entry.name);
      if (!file) continue;
      fs.closeSync(file.descriptor);
      result[entry.name] = '/assets/' + entry.name;
    }
  } catch {} finally { directory?.closeSync(); }
  return result;
}

export function withProfileAssets(state, stateFile) {
  const urls = profileAssetUrls(stateFile);
  if (!Object.keys(urls).length && !Object.hasOwn(state, 'profileAssets')) return state;
  const view = {...state};
  delete view.profileAssets;
  if (Object.keys(urls).length) view.profileAssets = urls;
  return view;
}
