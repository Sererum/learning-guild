import fs from 'node:fs';
import path from 'node:path';

// Use an already installed browser. Playwright's own browser is the final
// fallback when no system Chrome is found; this helper never downloads one.
export function browserOptions({env=process.env,platform=process.platform,exists=fs.existsSync}={}){
 if(env.GUILD_CHROME_BIN){
  if(!exists(env.GUILD_CHROME_BIN))throw new Error('GUILD_CHROME_BIN указывает на отсутствующий браузер. Укажите существующий Chrome или Chromium.');
  return {headless:true,executablePath:env.GUILD_CHROME_BIN};
 }
 let candidates=[];
 if(platform==='darwin')candidates=['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
 else if(platform==='win32')candidates=[env.PROGRAMFILES,env['PROGRAMFILES(X86)'],env.LOCALAPPDATA].filter(Boolean).map(root=>path.win32.join(root,'Google','Chrome','Application','chrome.exe'));
 else candidates=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser','/snap/bin/chromium'];
 const executablePath=candidates.find(candidate=>exists(candidate));
 return {headless:true,...(executablePath?{executablePath}:{})};
}
