import test from 'node:test';
import assert from 'node:assert/strict';
import {browserOptions} from './browser-runtime.mjs';

test('Browser override uses an existing executable and clearly rejects a missing one',()=>{
 assert.deepEqual(browserOptions({env:{GUILD_CHROME_BIN:'/custom/chrome'},exists:value=>value==='/custom/chrome'}),{headless:true,executablePath:'/custom/chrome'});
 assert.throws(()=>browserOptions({env:{GUILD_CHROME_BIN:'/missing'},exists:()=>false}),/GUILD_CHROME_BIN/);
});
test('Installed Mac, Linux and Windows browsers are discovered without downloads',()=>{
 for(const[platform,env,target]of[
  ['darwin',{},'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  ['linux',{},'/usr/bin/chromium'],
  ['win32',{PROGRAMFILES:'C:\\Program Files'},'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']
 ])assert.equal(browserOptions({platform,env,exists:value=>value===target}).executablePath,target);
});
test('No system browser leaves selection to the existing Playwright installation',()=>{
 assert.deepEqual(browserOptions({env:{},platform:'linux',exists:()=>false}),{headless:true});
});
