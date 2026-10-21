import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {initialState} from '../engine.mjs';
import {importCopiedSave,validateSave} from '../import-progress.mjs';
test('Import copies v1 without changing source, rejects overwrite and preserves unknown fields',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guild-import-'));try{const source=path.join(dir,'copy.json'),dest=path.join(dir,'app','progress.json'),state=initialState();state.customFutureField={draft:'kept'};fs.writeFileSync(source,JSON.stringify(state));const before=fs.readFileSync(source,'utf8');const imported=importCopiedSave(source,dest);assert.deepEqual(imported.customFutureField,state.customFutureField);assert.equal(fs.readFileSync(source,'utf8'),before);assert.throws(()=>importCopiedSave(source,dest),/уже существует/);assert.equal(fs.readFileSync(source,'utf8'),before);}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('Reject malformed saves without normalizing the input object',()=>{assert.throws(()=>validateSave({version:1}),/совместимое/);const s=initialState();delete s.materials;validateSave(s);assert.equal(s.materials,undefined);});
