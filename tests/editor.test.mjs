import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const context={document:{getElementById:()=>({addEventListener(){}}),addEventListener(){}},window:{addEventListener(){}}};
vm.runInNewContext(fs.readFileSync(new URL('../public/lesson-workbench/editor.js',import.meta.url),'utf8'),context);
const tokenize=context.window.guildEditor.tokenize;
const tokens=code=>Array.from(tokenize(code),token=>({...token}));
test('Python colours keep comments and quoted/triple/f-string contents separate',()=>{
 const source='if price > 1.5:\n    print("# not a comment", f"{price}") # comment\ntext = """first\nsecond"""\n';
 const result=tokens(source);assert.equal(result.map(token=>token.text).join(''),source);
 assert.deepEqual(result.filter(token=>token.kind==='string').map(token=>token.text),['"# not a comment"','f"{price}"','"""first\nsecond"""']);
 assert.deepEqual(result.filter(token=>token.kind==='comment').map(token=>token.text),['# comment']);
 assert.deepEqual(result.filter(token=>token.kind==='keyword').map(token=>token.text),['if']);
});
test('Python colours support escapes, raw strings, Unicode names and numeric literals',()=>{
 const source='цена = 0xFF + 0b10 + 0o7 + 1_000 + .5 + 1.2e-3 + 2j\nraw = r"a\\\\b"\nquote = "say \\"hi\\""';
 const result=tokens(source);assert.equal(result.map(token=>token.text).join(''),source);
 assert.deepEqual(result.filter(token=>token.kind==='number').map(token=>token.text),['0xFF','0b10','0o7','1_000','.5','1.2e-3','2j']);
 assert.equal(result[0].kind,'name');assert.equal(result[0].text,'цена');
 assert.equal(result.filter(token=>token.kind==='string').length,2);
});
test('unfinished strings recover at a newline and preserve literal markup',()=>{
 const source='value = "<img>\nprint(2)\n';const result=tokens(source);
 assert.equal(result.map(token=>token.text).join(''),source);assert.equal(result.find(token=>token.kind==='string').closed,false);
 assert.equal(result.find(token=>token.text==='print').kind,'builtin');
 assert.equal(tokens("'''multiline\nunfinished")[0].closed,false);
});
